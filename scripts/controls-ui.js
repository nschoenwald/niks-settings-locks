/**
 * Nik's Settings Locks — Controls UI
 *
 * Injects lock toggle icons into the ControlsConfig (Configure Controls)
 * application for GM users, and shows lock indicators for players.
 */

import { KB_PREFIX, getLockMap, canManageLocks } from "./lock-store.js";
import { createLockIcon, updateLockIcon, bindLockPicker, changeLockType } from "./lock-picker.js";

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

    const map = getLockMap();
    const isManager = canManageLocks();

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
        _processFormGroup(group, lockKey, map, isManager);
    }

    // Lock picker for every lock icon in this window (bound once per window)
    if (isManager) bindLockPicker(html, (icon, type) => _onPickLock(app, icon, type));
}

/**
 * Process a single form-group: inject lock icon and apply disabling.
 */
function _processFormGroup(group, lockKey, map, isManager) {
    const lock = map[lockKey] ?? null;
    _injectLockIcon(group, lockKey, lock, isManager);

    // Disable inputs:
    // - "hard": disabled for ALL users
    // - "player": disabled for non-managers only
    _applyGroupLockState(group, lock, isManager);
}

/**
 * Disable or re-enable a keybinding form-group according to its lock.
 */
function _applyGroupLockState(group, lock, isManager) {
    const isHard = lock?.type === "hard";
    const isPlayerLocked = !isManager && lock?.type === "player";
    group.classList.toggle("nsl-hard-locked", isHard || isPlayerLocked);
}

// ---------------------------------------------------------------------------
//  Lock Icon Injection
// ---------------------------------------------------------------------------

/**
 * Inject a lock icon into a keybinding's form-group.
 */
function _injectLockIcon(group, lockKey, lock, isManager) {
    if (group.querySelector(".nsl-lock-icon")) return;

    const icon = createLockIcon(lockKey, lock, isManager);

    // V14 ControlsConfig uses <span class="label"> not <label>
    const label = group.querySelector("label") || group.querySelector("span.label");
    if (label) {
        label.prepend(icon);
    } else {
        group.prepend(icon);
    }
}

/**
 * Apply the lock type the GM picked for a keybinding.
 */
async function _onPickLock(app, icon, type) {
    const lockKey = icon.dataset.lockKey;
    const { changed, localValueChanged } = await changeLockType(lockKey, type);
    if (!changed) return;

    // The GM's own bindings changed (switched to "Locked for everyone"): show them
    if (localValueChanged) return app.render();

    const lock = getLockMap()[lockKey] ?? null;
    updateLockIcon(icon, lock, true);
    const group = icon.closest(".form-group");
    if (group) _applyGroupLockState(group, lock, true);
}
