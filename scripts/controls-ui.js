/**
 * Nik's Settings Locks — Controls UI
 *
 * Injects lock toggle icons into the KeybindingsConfig (Configure Controls)
 * application for GM users, and shows lock indicators for players.
 */

import {
    MODULE_ID, SOCKET_CHANNEL, KB_PREFIX,
    getLockMap, setLock, removeLock
} from "./lock-store.js";
import { refreshHardLockSet } from "./enforcer.js";

// ---------------------------------------------------------------------------
//  Public API
// ---------------------------------------------------------------------------

/**
 * Initialize the controls UI hooks.
 */
export function initControlsUI() {
    Hooks.on("renderKeybindingsConfig", _onRenderKeybindingsConfig);
}

// ---------------------------------------------------------------------------
//  Hook Handler
// ---------------------------------------------------------------------------

/**
 * Called whenever KeybindingsConfig renders. Injects lock icons and controls.
 * @param {KeybindingsConfig} app
 * @param {HTMLElement} html  The application element
 */
function _onRenderKeybindingsConfig(app, html) {
    const map = getLockMap();
    const isGM = game.user.isGM;

    // Build a set of all lockable keybinding action keys
    const lockableActions = new Set();
    for (const [actionKey, actionConfig] of game.keybindings.actions.entries()) {
        // Skip uneditable-only keybindings (they have no editable bindings)
        if (actionConfig.editable?.length === 0 && actionConfig.uneditable?.length > 0) continue;
        lockableActions.add(actionKey);
    }

    // Strategy 1: form-groups with data-action-id
    const formGroups = html.querySelectorAll(".form-group[data-action-id]");

    if (formGroups.length > 0) {
        for (const group of formGroups) {
            const actionKey = group.dataset.actionId;
            if (!actionKey || !lockableActions.has(actionKey)) continue;
            const lockKey = `${KB_PREFIX}${actionKey}`;
            _processFormGroup(group, lockKey, actionKey, map, isGM);
        }
    } else {
        // Strategy 2: fallback — look for keybinding action elements by other attributes
        const actionElements = html.querySelectorAll("[data-action-id]");
        const processed = new Set();

        for (const el of actionElements) {
            const actionKey = el.dataset.actionId;
            if (!actionKey || !lockableActions.has(actionKey) || processed.has(actionKey)) continue;

            const group = el.closest(".form-group") ?? el;
            processed.add(actionKey);

            const lockKey = `${KB_PREFIX}${actionKey}`;
            _processFormGroup(group, lockKey, actionKey, map, isGM);
        }
    }
}

/**
 * Process a single form-group: inject lock icon and apply disabling.
 */
function _processFormGroup(group, lockKey, actionKey, map, isGM) {
    const lock = map[lockKey] ?? null;
    _injectLockIcon(group, lockKey, actionKey, lock, isGM);

    // Disable hard-locked keybinding inputs for ALL users
    if (lock?.type === "hard") {
        group.classList.add("nsl-hard-locked");
    }
}

// ---------------------------------------------------------------------------
//  Lock Icon Injection
// ---------------------------------------------------------------------------

/**
 * Inject a lock icon into a keybinding's form-group.
 */
function _injectLockIcon(group, lockKey, actionKey, lock, isGM) {
    // Don't double-inject
    if (group.querySelector(".nsl-lock-icon")) return;

    const icon = document.createElement("a");
    icon.classList.add("nsl-lock-icon");
    icon.dataset.lockKey = lockKey;

    // Set initial state
    _updateLockIcon(icon, lock, isGM);

    if (isGM) {
        // Left click: cycle forward (unlocked → soft → hard → unlocked)
        icon.addEventListener("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            await _cycleLockForward(icon, lockKey, actionKey, group);
        });

        // Right click: cycle backward (unlocked → hard → soft → unlocked)
        icon.addEventListener("contextmenu", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            await _cycleLockBackward(icon, lockKey, actionKey, group);
        });
    }

    // Insert the icon at the start of the form-group label
    const label = group.querySelector("label");
    if (label) {
        label.prepend(icon);
    } else {
        group.prepend(icon);
    }
}

/**
 * Update the lock icon appearance based on the lock state.
 */
function _updateLockIcon(icon, lock, isGM) {
    icon.classList.remove("nsl-unlocked", "nsl-soft", "nsl-hard");
    icon.innerHTML = "";

    const i = document.createElement("i");

    if (!lock) {
        icon.classList.add("nsl-unlocked");
        i.className = "fa-solid fa-lock-open";
        icon.title = isGM
            ? game.i18n.localize("NSL.Tooltip.Unlocked")
            : "";
        if (!isGM) icon.style.display = "none";
    } else if (lock.type === "soft") {
        icon.classList.add("nsl-soft");
        i.className = "fa-solid fa-lock";
        icon.title = isGM
            ? game.i18n.localize("NSL.Tooltip.Soft")
            : game.i18n.localize("NSL.Tooltip.SoftLockedByGM");
        icon.style.display = "";
    } else if (lock.type === "hard") {
        icon.classList.add("nsl-hard");
        i.className = "fa-solid fa-lock";
        icon.title = isGM
            ? game.i18n.localize("NSL.Tooltip.Hard")
            : game.i18n.localize("NSL.Tooltip.LockedByGM");
        icon.style.display = "";
    }

    icon.appendChild(i);
}

// ---------------------------------------------------------------------------
//  Lock Cycling
// ---------------------------------------------------------------------------

/**
 * Get the current keybinding value for a given action key.
 */
function _getKeybindingValue(actionKey) {
    const [namespace, ...actionParts] = actionKey.split(".");
    const action = actionParts.join(".");
    try {
        return game.keybindings.get(namespace, action);
    } catch {
        return [];
    }
}

/**
 * Cycle the lock state forward: unlocked → soft → hard → unlocked.
 */
async function _cycleLockForward(icon, lockKey, actionKey, group) {
    const lock = getLockMap()[lockKey] ?? null;
    const value = _getKeybindingValue(actionKey);

    if (!lock) {
        await setLock(lockKey, "soft", value);
        _updateLockIcon(icon, { type: "soft" }, true);
    } else if (lock.type === "soft") {
        await setLock(lockKey, "hard", value);
        _updateLockIcon(icon, { type: "hard" }, true);
        group.classList.add("nsl-hard-locked");
    } else {
        await removeLock(lockKey);
        _updateLockIcon(icon, null, true);
        group.classList.remove("nsl-hard-locked");
    }

    refreshHardLockSet();
    game.socket.emit(SOCKET_CHANNEL, { action: "apply-locks" });
}

/**
 * Cycle the lock state backward: unlocked → hard → soft → unlocked.
 */
async function _cycleLockBackward(icon, lockKey, actionKey, group) {
    const lock = getLockMap()[lockKey] ?? null;
    const value = _getKeybindingValue(actionKey);

    if (!lock) {
        await setLock(lockKey, "hard", value);
        _updateLockIcon(icon, { type: "hard" }, true);
        group.classList.add("nsl-hard-locked");
    } else if (lock.type === "hard") {
        await setLock(lockKey, "soft", value);
        _updateLockIcon(icon, { type: "soft" }, true);
        group.classList.remove("nsl-hard-locked");
    } else {
        await removeLock(lockKey);
        _updateLockIcon(icon, null, true);
    }

    refreshHardLockSet();
    game.socket.emit(SOCKET_CHANNEL, { action: "apply-locks" });
}
