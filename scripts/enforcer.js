/**
 * Nik's Settings Locks — Enforcer
 *
 * Client-side enforcement logic. Responsibilities:
 * 1. On "ready": apply all locked values from the world lock map.
 * 2. Runtime: wrap ClientSettings.prototype.set and
 *    ClientKeybindings.prototype.set to block hard-locked changes.
 * 3. Socket listener: re-enforce when the GM changes locks.
 */

import {
    MODULE_ID, SOCKET_CHANNEL, KB_PREFIX,
    getLockMap, getLock, shouldApplySoftLock, markSoftLockApplied,
    canManageLocks, getEditableBindings, LOCKS_CHANGED_HOOK
} from "./lock-store.js";
import { promptLockUpdates } from "./lock-update-prompt.js";

/** Track which keys (settings + keybindings) are currently hard-locked. */
const _hardLockedKeys = new Set();

/** Flag to bypass our own set() wrappers when we apply locks internally. */
let _bypassEnforcement = false;

/** Batching for the GM's changes to locked items, per lock type, so one prompt covers a whole form save. */
const _pendingLockUpdates = { soft: new Map(), hard: new Map() };
const _lockUpdateTimeouts = { soft: null, hard: null };

function _queueLockUpdate(type, key, value) {
    _pendingLockUpdates[type].set(key, value);
    if (_lockUpdateTimeouts[type] !== null) {
        clearTimeout(_lockUpdateTimeouts[type]);
    }
    _lockUpdateTimeouts[type] = setTimeout(() => {
        const updates = new Map(_pendingLockUpdates[type]);
        _pendingLockUpdates[type].clear();
        _lockUpdateTimeouts[type] = null;
        // Declined changes to values locked for everyone are undone: the lock binds the GM too
        const onDecline = type === "hard" ? _restoreLockedValues : undefined;
        promptLockUpdates(type, updates, { onDecline });
    }, 100);
}

/**
 * Put this client's values back to their locked values.
 * @param {string[]} keys
 */
async function _restoreLockedValues(keys) {
    for (const key of keys) await applyLock(key);
}

// ---------------------------------------------------------------------------
//  Public API
// ---------------------------------------------------------------------------

/**
 * Register the libWrapper wrappers. Call during "init" hook.
 * Socket listener and lock application happen later during "ready".
 */
export function initEnforcer() {
    _wrapSettingsSet();
    _wrapKeybindingsSet();
}

/**
 * Register the socket listener for GM broadcasts.
 * Must be called during "ready" when game.socket is available.
 */
export function registerSocketListener() {
    _registerSocketListener();
}

/**
 * Apply all locks from the world lock map to this client.
 * Called on "ready" and when the GM broadcasts a lock change.
 * @returns {Promise<Set<string>>} The lock keys whose values were changed on this client
 */
export async function applyLocks() {
    const map = getLockMap();
    const entries = Object.entries(map);
    const changedKeys = new Set();

    // Clear the hard-lock set and rebuild it
    _hardLockedKeys.clear();

    if (!entries.length) return changedKeys;

    let needsReload = false;

    for (const [lockKey, lock] of entries) {
        const result = await _applyLockEntry(lockKey, lock);
        if (result.applied) changedKeys.add(lockKey);
        if (result.needsReload) needsReload = true;
    }

    const applied = changedKeys.size;
    if (applied > 0) {
        console.log(`${MODULE_ID} | Applied ${applied} locked item(s).`);
        const localeKey = applied === 1 ? "NSL.Notifications.LocksAppliedOne" : "NSL.Notifications.LocksAppliedMany";
        ui.notifications?.info(game.i18n.format(localeKey, { count: applied }));
    }

    if (needsReload) _handleReload();
    return changedKeys;
}

/**
 * Apply a single lock from the world lock map to this client.
 * Used when a manager changes a lock in a way that also changes their own value
 * (e.g. Player Lock → Hard Lock, where the locked player value becomes the value for everyone).
 * @param {string} lockKey  "namespace.key" or "kb:namespace.action"
 * @returns {Promise<boolean>} Whether the value was changed on this client
 */
export async function applyLock(lockKey) {
    const lock = getLock(lockKey);
    if (!lock) return false;
    const result = await _applyLockEntry(lockKey, lock);
    if (result.needsReload) _handleReload();
    return result.applied > 0;
}

/**
 * Rebuild the hard-locked keys set from the current lock map.
 * Called when locks change to update runtime prevention without full reapply.
 */
export function refreshHardLockSet() {
    _hardLockedKeys.clear();
    const map = getLockMap();
    for (const [key, lock] of Object.entries(map)) {
        if (lock.type !== "hard" && lock.type !== "player") continue;

        // Keybinding locks are always safe (stored client-side)
        if (key.startsWith(KB_PREFIX)) {
            _hardLockedKeys.add(key);
            continue;
        }

        // Only include client/user-scoped settings — world-scoped settings
        // must never be enforced from non-GM clients (causes permission errors)
        const config = game.settings.settings.get(key);
        if (config && (config.scope === "client" || config.scope === "user")) {
            _hardLockedKeys.add(key);
        }
    }
}

/**
 * Check if a key (setting or keybinding) is currently hard-locked.
 * @param {string} key  "namespace.key" or "kb:namespace.action"
 * @returns {boolean}
 */
export function isHardLocked(key) {
    return _hardLockedKeys.has(key);
}

// ---------------------------------------------------------------------------
//  Lock Application Helpers
// ---------------------------------------------------------------------------

/**
 * Apply one lock entry, dispatching to the setting or keybinding handler.
 * @returns {Promise<{applied: number, needsReload: boolean}>}
 */
async function _applyLockEntry(lockKey, lock) {
    if (lockKey.startsWith(KB_PREFIX)) {
        return { applied: await _applyKeybindingLock(lockKey, lock), needsReload: false };
    }
    return _applySettingLock(lockKey, lock);
}

/**
 * Handle a lock that changed a setting which requires a reload.
 * Players are reloaded automatically; managers are asked first so they never lose work.
 */
function _handleReload() {
    if (canManageLocks()) {
        foundry.applications.settings.SettingsConfig.reloadConfirm({ world: false });
        return;
    }
    ui.notifications?.warn(game.i18n.localize("NSL.Notifications.ReloadForcing"));
    setTimeout(() => window.location.reload(), 1500);
}

// ---------------------------------------------------------------------------
//  Setting Lock Application
// ---------------------------------------------------------------------------

async function _applySettingLock(settingKey, lock) {
    const { type, value, rev } = lock;
    const [namespace, ...keyParts] = settingKey.split(".");
    const key = keyParts.join(".");

    const config = game.settings.settings.get(settingKey);
    if (!config) return { applied: 0, needsReload: false };
    if (config.scope !== "client" && config.scope !== "user") return { applied: 0, needsReload: false };

    const isPlayerLock = type === "player";
    const isHardLock = type === "hard";

    if (isHardLock || isPlayerLock) {
        _hardLockedKeys.add(settingKey);

        // Player locks are only enforced on non-managers; managers keep personal settings
        if (isPlayerLock && canManageLocks()) {
            return { applied: 0, needsReload: false };
        }

        try {
            const current = game.settings.get(namespace, key);
            if (!_settingValuesEqual(settingKey, current, value)) {
                _bypassEnforcement = true;
                try {
                    await game.settings.set(namespace, key, value);
                } finally {
                    _bypassEnforcement = false;
                }
                return { applied: 1, needsReload: !!config.requiresReload };
            }
        } catch (err) {
            console.warn(`${MODULE_ID} | Failed to enforce ${type} lock on ${settingKey}:`, err);
        }
    } else if (type === "soft") {
        // Soft locks are recommended defaults for player clients — managers keep personal values
        if (canManageLocks()) {
            return { applied: 0, needsReload: false };
        }

        if (shouldApplySoftLock(settingKey, rev)) {
            try {
                const current = game.settings.get(namespace, key);
                if (!_settingValuesEqual(settingKey, current, value)) {
                    _bypassEnforcement = true;
                    try {
                        await game.settings.set(namespace, key, value);
                    } finally {
                        _bypassEnforcement = false;
                    }
                    markSoftLockApplied(settingKey, rev);
                    return { applied: 1, needsReload: !!config.requiresReload };
                }
                markSoftLockApplied(settingKey, rev);
            } catch (err) {
                console.warn(`${MODULE_ID} | Failed to enforce soft lock on ${settingKey}:`, err);
            }
        }
    }

    return { applied: 0, needsReload: false };
}

// ---------------------------------------------------------------------------
//  Keybinding Lock Application
// ---------------------------------------------------------------------------

async function _applyKeybindingLock(lockKey, lock) {
    const { type, value, rev } = lock;
    const actionKey = lockKey.slice(KB_PREFIX.length); // remove "kb:" prefix
    const [namespace, ...actionParts] = actionKey.split(".");
    const action = actionParts.join(".");

    // Verify the keybinding action exists
    const actionConfig = game.keybindings.actions.get(actionKey);
    if (!actionConfig) return 0;

    const isPlayerLock = type === "player";
    const isHardLock = type === "hard";

    if (isHardLock || isPlayerLock) {
        _hardLockedKeys.add(lockKey);

        // Player locks are only enforced on non-managers
        if (isPlayerLock && canManageLocks()) {
            return 0;
        }

        try {
            const current = getEditableBindings(actionKey);
            if (!_valuesEqual(current, value)) {
                _bypassEnforcement = true;
                try {
                    await game.keybindings.set(namespace, action, value);
                } finally {
                    _bypassEnforcement = false;
                }
                return 1;
            }
        } catch (err) {
            console.warn(`${MODULE_ID} | Failed to enforce ${type} lock on keybinding ${actionKey}:`, err);
        }
    } else if (type === "soft") {
        // Soft locks are recommended defaults for player clients — managers keep personal values
        if (canManageLocks()) {
            return 0;
        }

        if (shouldApplySoftLock(lockKey, rev)) {
            try {
                const current = getEditableBindings(actionKey);
                if (!_valuesEqual(current, value)) {
                    _bypassEnforcement = true;
                    try {
                        await game.keybindings.set(namespace, action, value);
                    } finally {
                        _bypassEnforcement = false;
                    }
                    markSoftLockApplied(lockKey, rev);
                    return 1;
                }
                markSoftLockApplied(lockKey, rev);
            } catch (err) {
                console.warn(`${MODULE_ID} | Failed to enforce soft lock on keybinding ${actionKey}:`, err);
            }
        }
    }

    return 0;
}

// ---------------------------------------------------------------------------
//  Internals — Wrappers
// ---------------------------------------------------------------------------

/**
 * Wrap ClientSettings.prototype.set to block hard-locked setting changes.
 */
function _wrapSettingsSet() {
    libWrapper.register(MODULE_ID, "ClientSettings.prototype.set", async function (wrapped, namespace, key, value, ...rest) {
        if (_bypassEnforcement) return wrapped(namespace, key, value, ...rest);

        const settingKey = `${namespace}.${key}`;

        if (canManageLocks()) {
            const result = await wrapped(namespace, key, value, ...rest);
            const lock = getLock(settingKey);
            if (lock && !_settingValuesEqual(settingKey, value, lock.value)) {
                // Player locks: the GM's value is personal, nothing to do
                if (lock.type === "hard" || lock.type === "soft") _queueLockUpdate(lock.type, settingKey, value);
            }
            return result;
        }

        if (_hardLockedKeys.has(settingKey)) {
            // Double-check scope — never block or redirect writes to world-scoped
            // settings from non-GM clients, as that would cause permission errors
            const config = game.settings.settings.get(settingKey);
            if (!config || (config.scope !== "client" && config.scope !== "user")) {
                return wrapped(namespace, key, value, ...rest);
            }

            const lock = getLock(settingKey);

            if (lock && _settingValuesEqual(settingKey, value, lock.value)) {
                return wrapped(namespace, key, value, ...rest);
            }

            const name = config.name
                ? game.i18n.localize(config.name)
                : settingKey;
            const notifKey = lock?.type === "player"
                ? "NSL.Notifications.PlayerLockBlocked"
                : "NSL.Notifications.HardLockBlocked";
            ui.notifications.warn(game.i18n.format(notifKey, { name }));

            if (lock) return wrapped(namespace, key, lock.value, ...rest);
            return;
        }

        return wrapped(namespace, key, value, ...rest);
    }, "WRAPPER");
}

/**
 * Wrap ClientKeybindings.prototype.set to block hard-locked keybinding changes.
 */
function _wrapKeybindingsSet() {
    libWrapper.register(MODULE_ID, "ClientKeybindings.prototype.set", async function (wrapped, namespace, action, bindings, ...rest) {
        if (_bypassEnforcement) return wrapped(namespace, action, bindings, ...rest);
        
        const lockKey = `${KB_PREFIX}${namespace}.${action}`;

        if (canManageLocks()) {
            const result = await wrapped(namespace, action, bindings, ...rest);
            const lock = getLock(lockKey);
            if (lock && !_valuesEqual(bindings, lock.value)) {
                // Player locks: the GM's bindings are personal, nothing to do
                if (lock.type === "hard" || lock.type === "soft") _queueLockUpdate(lock.type, lockKey, bindings);
            }
            return result;
        }
        if (_hardLockedKeys.has(lockKey)) {
            const lock = getLock(lockKey);

            if (lock && _valuesEqual(bindings, lock.value)) {
                return wrapped(namespace, action, bindings, ...rest);
            }

            const actionConfig = game.keybindings.actions.get(`${namespace}.${action}`);
            const name = actionConfig?.name
                ? game.i18n.localize(actionConfig.name)
                : `${namespace}.${action}`;
            const notifKey = lock?.type === "player"
                ? "NSL.Notifications.PlayerLockBlocked"
                : "NSL.Notifications.HardLockBlocked";
            ui.notifications.warn(game.i18n.format(notifKey, { name }));

            if (lock) return wrapped(namespace, action, lock.value, ...rest);
            return;
        }

        return wrapped(namespace, action, bindings, ...rest);
    }, "WRAPPER");
}

/**
 * Register the socket listener for GM broadcasts.
 */
function _registerSocketListener() {
    game.socket.on(SOCKET_CHANNEL, async (data) => {
        if (data?.action === "apply-locks") {
            const isManager = canManageLocks();

            if (!isManager) {
                console.log(`${MODULE_ID} | Received lock update from GM, re-applying...`);
                ui.notifications?.info(game.i18n.localize("NSL.Notifications.LocksEnforced"));
            }

            // Apply locks on this client (player locks are safely skipped for managers)
            const changedKeys = await applyLocks();

            // Configure Settings is refreshed in place so unsaved edits survive.
            // ControlsConfig keeps its pending edits across renders, so a re-render is safe.
            Hooks.callAll(LOCKS_CHANGED_HOOK, changedKeys);
            _rerenderOpenApp("ControlsConfig");
            _rerenderOpenApp("LockManagerApp");
        }
    });
}

/**
 * Find and re-render open ApplicationV2 instances by class name.
 * Uses foundry.applications.instances (V14).
 */
function _rerenderOpenApp(className) {
    try {
        // V14: foundry.applications.instances is a Map of all active ApplicationV2 instances
        if (foundry.applications?.instances) {
            for (const app of foundry.applications.instances.values()) {
                if (app.constructor.name === className) {
                    app.render();
                }
            }
        }
    } catch {
        // Silently ignore — window not open
    }
}

// ---------------------------------------------------------------------------
//  Deep Equality
// ---------------------------------------------------------------------------

/**
 * Deep equality check for setting/keybinding values.
 * Locked values are stored as JSON, while game.settings.get() can return class instances
 * (DataModels, Sets…), so both sides are compared in their JSON form.
 */
function _valuesEqual(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    try {
        return foundry.utils.equals(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
    } catch {
        return false;
    }
}

/**
 * Compare two values of a setting as the setting would store them: both are read back through the
 * setting's type, as game.settings.get() does. A locked value saved as "1" for a Number setting
 * therefore equals the 1 that game.settings.get() returns.
 * @param {string} settingKey
 */
function _settingValuesEqual(settingKey, a, b) {
    return _valuesEqual(_asSettingValue(settingKey, a), _asSettingValue(settingKey, b));
}

/**
 * The value game.settings.get() would return after the setting was set to `value`.
 * @param {string} settingKey
 * @param {*} value
 */
function _asSettingValue(settingKey, value) {
    if (value === undefined) return value;
    try {
        return new foundry.documents.Setting({ key: settingKey, value: JSON.stringify(value) }).value;
    } catch {
        return value;
    }
}
