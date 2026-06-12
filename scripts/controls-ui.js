/**
 * Nik's Settings Locks — Controls UI
 *
 * Injects lock toggle icons into the ControlsConfig (Configure Controls)
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
    // V14: the Configure Controls window is ControlsConfig (not KeybindingsConfig)
    Hooks.on("renderControlsConfig", (app, html) => _onRenderControls(app, html));
}

// ---------------------------------------------------------------------------
//  Hook Handler
// ---------------------------------------------------------------------------

/**
 * Called whenever the ControlsConfig renders.
 * Injects lock icons next to each keybinding action.
 */
function _onRenderControls(app, html) {
    if (!html || !html.querySelectorAll) return;
    if (html.querySelector(".nsl-lock-icon")) return;

    const map = getLockMap();
    const isGM = game.user.isGM;

    // Build a set of all lockable keybinding action keys
    const lockableActions = new Set();
    for (const [actionKey] of game.keybindings.actions.entries()) {
        lockableActions.add(actionKey);
    }

    // V14 DOM: <div class="form-group" data-action-id="core.characterSheet">
    //            <span class="label">Toggle Character Sheet</span>
    //            <ul class="form-fields flexcol"> ... </ul>
    //          </div>
    const formGroups = html.querySelectorAll(".form-group[data-action-id]");

    for (const group of formGroups) {
        const actionKey = group.dataset.actionId;
        if (!actionKey || !lockableActions.has(actionKey)) continue;
        const lockKey = `${KB_PREFIX}${actionKey}`;
        _processFormGroup(group, lockKey, actionKey, map, isGM);
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
    if (group.querySelector(".nsl-lock-icon")) return;

    const icon = document.createElement("a");
    icon.classList.add("nsl-lock-icon");
    icon.dataset.lockKey = lockKey;

    _updateLockIcon(icon, lock, isGM);

    if (isGM) {
        icon.addEventListener("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            await _cycleLockForward(icon, lockKey, actionKey, group);
        });

        icon.addEventListener("contextmenu", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            await _cycleLockBackward(icon, lockKey, actionKey, group);
        });
    }

    // V14 ControlsConfig uses <span class="label"> not <label>
    const label = group.querySelector("label") || group.querySelector("span.label");
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

function _getKeybindingValue(actionKey) {
    const [namespace, ...actionParts] = actionKey.split(".");
    const action = actionParts.join(".");
    try {
        return game.keybindings.get(namespace, action);
    } catch {
        return [];
    }
}

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
