/**
 * Nik's Settings Locks — Lock Picker
 *
 * Shared lock-state definitions, lock icon rendering, and the click menu
 * GMs use to choose a lock type in Configure Settings, Configure Controls
 * and the Lock Manager.
 */

import { KB_PREFIX, SOCKET_CHANNEL, getLock, setLock, removeLock, getEditableBindings } from "./lock-store.js";
import { refreshHardLockSet, applyLock } from "./enforcer.js";

/**
 * The lock states in menu order. `type` is the stored lock type (null = unlocked).
 * CSS classes (`nsl-unlocked`, `nsl-soft`, …) keep the internal type names.
 */
export const LOCK_STATES = [
    { type: null, cssClass: "nsl-unlocked", icon: "fa-solid fa-lock-open", label: "NSL.LockType.None", hint: "NSL.LockHint.None" },
    { type: "hard", cssClass: "nsl-hard", icon: "fa-solid fa-lock", label: "NSL.LockType.Hard", hint: "NSL.LockHint.Hard" },
    { type: "player", cssClass: "nsl-player", icon: "fa-solid fa-user-lock", label: "NSL.LockType.Player", hint: "NSL.LockHint.Player" },
    { type: "soft", cssClass: "nsl-soft", icon: "fa-solid fa-thumbtack", label: "NSL.LockType.Soft", hint: "NSL.LockHint.Soft" }
];

/**
 * @param {string|null|undefined} type
 * @returns {typeof LOCK_STATES[number]}
 */
export function getLockState(type) {
    return LOCK_STATES.find(s => s.type === (type ?? null)) ?? LOCK_STATES[0];
}

// ---------------------------------------------------------------------------
//  Lock Icon
// ---------------------------------------------------------------------------

/**
 * Create a lock icon element. For managers it's keyboard-focusable and opens the picker.
 * @param {string} lockKey  "namespace.key" or "kb:namespace.action"
 * @param {object|null} lock
 * @param {boolean} isManager
 * @param {string} [className="nsl-lock-icon"]
 * @returns {HTMLAnchorElement}
 */
export function createLockIcon(lockKey, lock, isManager, className = "nsl-lock-icon") {
    const icon = document.createElement("a");
    icon.classList.add(className);
    icon.dataset.lockKey = lockKey;
    if (isManager) {
        icon.classList.add("nsl-lock-picker-target");
        icon.setAttribute("role", "button");
        icon.setAttribute("aria-haspopup", "menu");
        icon.tabIndex = 0;
        // Enter / Space open the picker like a click (the picker listens for clicks)
        icon.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            icon.click();
        });
    }
    updateLockIcon(icon, lock, isManager);
    return icon;
}

/**
 * Update a lock icon's appearance, tooltip and accessible label for a lock state.
 * @param {HTMLElement} icon
 * @param {object|null} lock
 * @param {boolean} isManager
 */
export function updateLockIcon(icon, lock, isManager) {
    const state = getLockState(lock?.type);
    icon.classList.remove(...LOCK_STATES.map(s => s.cssClass));
    icon.classList.add(state.cssClass);
    icon.innerHTML = `<i class="${state.icon}" inert></i>`;
    icon.dataset.lockType = state.type ?? "none";

    const label = game.i18n.localize(state.label);
    let tooltipHtml;
    let ariaLabel;
    if (isManager) {
        const hint = game.i18n.localize(state.hint);
        const action = game.i18n.localize("NSL.Tooltip.ClickToChange");
        tooltipHtml = `<strong>${_esc(label)}</strong><br>${_esc(hint)}<br><em>${_esc(action)}</em>`;
        ariaLabel = `${label}. ${action}`;
        icon.style.display = "";
    } else if (!state.type) {
        // Players don't see anything for unlocked items
        icon.style.display = "none";
    } else {
        const text = game.i18n.localize(state.type === "soft" ? "NSL.Tooltip.SoftLockedByGM" : "NSL.Tooltip.LockedByGM");
        tooltipHtml = `<strong>${_esc(label)}</strong><br>${_esc(text)}`;
        ariaLabel = `${label}. ${text}`;
        icon.style.display = "";
    }

    if (tooltipHtml) icon.dataset.tooltipHtml = tooltipHtml;
    else delete icon.dataset.tooltipHtml;
    if (ariaLabel) icon.setAttribute("aria-label", ariaLabel);
    else icon.removeAttribute("aria-label");
    icon.removeAttribute("title");
}

// ---------------------------------------------------------------------------
//  Changing Locks
// ---------------------------------------------------------------------------

/**
 * Read this client's current value for a setting or keybinding.
 * @param {string} lockKey
 */
export function getCurrentValue(lockKey) {
    if (lockKey.startsWith(KB_PREFIX)) {
        try {
            return getEditableBindings(lockKey.slice(KB_PREFIX.length));
        } catch {
            return [];
        }
    }
    const [namespace, ...keyParts] = lockKey.split(".");
    return game.settings.get(namespace, keyParts.join("."));
}

/**
 * Change an item's lock type and broadcast it.
 * Locking an unlocked item uses your current value; switching between lock types keeps the locked value.
 * Because "Locked for everyone" also applies to you, switching to it applies the locked value to this client.
 * @param {string} lockKey
 * @param {string|null} newType  "soft" | "player" | "hard", or null to unlock
 * @returns {Promise<{changed: boolean, localValueChanged: boolean}>}
 */
export async function changeLockType(lockKey, newType) {
    const lock = getLock(lockKey);
    if ((lock?.type ?? null) === newType) return { changed: false, localValueChanged: false };

    if (!newType) await removeLock(lockKey);
    else await setLock(lockKey, newType, lock ? lock.value : getCurrentValue(lockKey));

    refreshHardLockSet();
    game.socket.emit(SOCKET_CHANNEL, { action: "apply-locks" });

    const localValueChanged = newType === "hard" ? await applyLock(lockKey) : false;
    return { changed: true, localValueChanged };
}

// ---------------------------------------------------------------------------
//  Picker Menu
// ---------------------------------------------------------------------------

/** Containers that already have a picker, so re-renders don't stack listeners. */
const _boundContainers = new WeakSet();

/**
 * Attach the lock picker to every `.nsl-lock-picker-target` inside a container.
 * Safe to call on every render.
 * @param {HTMLElement} container
 * @param {(target: HTMLElement, type: string|null) => Promise<void>|void} onSelect
 *        Called after the user picks a state different from the current one
 */
export function bindLockPicker(container, onSelect) {
    if (!container || _boundContainers.has(container)) return;
    _boundContainers.add(container);

    const MenuClass = _getMenuClass();
    const menu = new MenuClass(container, ".nsl-lock-picker-target", [], {
        eventName: "click",
        fixed: true,
        relative: "target",
        jQuery: false,
        classes: ["nsl-lock-picker"],
        onOpen: (target) => {
            const current = target.dataset.lockType === "none" ? null : target.dataset.lockType;
            menu.menuItems = LOCK_STATES.map(state => ({
                label: state.label,
                icon: state.icon,
                classes: [state.cssClass, state.type === current ? "nsl-picker-current" : ""].filterJoin(" "),
                hint: state.hint,
                onClick: async (_event, picked) => {
                    if (state.type === current) return;
                    await onSelect(picked, state.type);
                }
            }));
        }
    });
}

let _LockPickerMenu = null;

/**
 * ContextMenu subclass that adds a one-line description and a "current" tick to each entry.
 * Created lazily so it extends whichever ContextMenu implementation is configured.
 */
function _getMenuClass() {
    _LockPickerMenu ??= class LockPickerMenu extends foundry.applications.ux.ContextMenu.implementation {
        /**
         * Runs before the menu is measured and positioned, so the hints count towards its height
         * and the menu fits without scrolling.
         * @override
         */
        async _onRenderEntries(menu, options = {}) {
            for (const item of this.menuItems) {
                const span = item.element?.querySelector("span");
                if (!span) continue;
                if (item.hint) {
                    const hint = document.createElement("small");
                    hint.classList.add("nsl-picker-hint");
                    hint.textContent = game.i18n.localize(item.hint);
                    span.append(hint);
                }
                if (item.classes?.includes("nsl-picker-current")) {
                    const check = document.createElement("i");
                    check.className = "fa-solid fa-check nsl-picker-check";
                    check.inert = true;
                    item.element.append(check);
                    item.element.setAttribute("aria-current", "true");
                }
            }
            return super._onRenderEntries(menu, options);
        }
    };
    return _LockPickerMenu;
}

function _esc(text) {
    return foundry.utils.escapeHTML(String(text ?? ""));
}
