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
    getLockMap, getLock, setLock, shouldApplySoftLock, markSoftLockApplied,
    canManageLocks
} from "./lock-store.js";
import { promptSoftLockUpdates } from "./soft-lock-prompt.js";

/** Track which keys (settings + keybindings) are currently hard-locked. */
const _hardLockedKeys = new Set();

/** Flag to bypass our own set() wrappers when we apply locks internally. */
let _bypassEnforcement = false;

/** Batching for soft lock updates. */
let _pendingSoftLockUpdates = new Map();
let _softLockUpdateTimeout = null;

function _queueSoftLockUpdate(key, value) {
    _pendingSoftLockUpdates.set(key, value);
    if (_softLockUpdateTimeout !== null) {
        clearTimeout(_softLockUpdateTimeout);
    }
    _softLockUpdateTimeout = setTimeout(() => {
        const updates = new Map(_pendingSoftLockUpdates);
        _pendingSoftLockUpdates.clear();
        _softLockUpdateTimeout = null;
        promptSoftLockUpdates(updates);
    }, 100);
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
 */
export async function applyLocks() {
    const map = getLockMap();
    const entries = Object.entries(map);
    if (!entries.length) return;

    let applied = 0;
    let needsReload = false;

    // Clear the hard-lock set and rebuild it
    _hardLockedKeys.clear();

    for (const [lockKey, lock] of entries) {
        // Determine if this is a keybinding or a setting
        const isKeybinding = lockKey.startsWith(KB_PREFIX);

        if (isKeybinding) {
            applied += await _applyKeybindingLock(lockKey, lock);
        } else {
            const result = await _applySettingLock(lockKey, lock);
            applied += result.applied;
            if (result.needsReload) needsReload = true;
        }
    }

    if (applied > 0) {
        console.log(`${MODULE_ID} | Applied ${applied} locked item(s).`);
        const localeKey = applied === 1 ? "NSL.Notifications.LocksAppliedOne" : "NSL.Notifications.LocksAppliedMany";
        ui.notifications?.info(game.i18n.format(localeKey, { count: applied }));
    }

    if (needsReload) {
        ui.notifications?.warn(game.i18n.localize("NSL.Notifications.ReloadForcing"));
        setTimeout(() => window.location.reload(), 1500);
    }
}

/**
 * Rebuild the hard-locked keys set from the current lock map.
 * Called when locks change to update runtime prevention without full reapply.
 */
export function refreshHardLockSet() {
    _hardLockedKeys.clear();
    const map = getLockMap();
    for (const [key, lock] of Object.entries(map)) {
        if (lock.type !== "hard") continue;

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
//  Setting Lock Application
// ---------------------------------------------------------------------------

async function _applySettingLock(settingKey, lock) {
    const { type, value, rev } = lock;
    const [namespace, ...keyParts] = settingKey.split(".");
    const key = keyParts.join(".");

    const config = game.settings.settings.get(settingKey);
    if (!config) return { applied: 0, needsReload: false };
    if (config.scope !== "client" && config.scope !== "user") return { applied: 0, needsReload: false };

    if (type === "hard") {
        _hardLockedKeys.add(settingKey);
        try {
            const current = game.settings.get(namespace, key);
            if (!_valuesEqual(current, value)) {
                _bypassEnforcement = true;
                try {
                    await game.settings.set(namespace, key, value);
                } finally {
                    _bypassEnforcement = false;
                }
                return { applied: 1, needsReload: !!config.requiresReload };
            }
        } catch (err) {
            console.warn(`${MODULE_ID} | Failed to enforce hard lock on ${settingKey}:`, err);
        }
    } else if (type === "soft") {
        if (shouldApplySoftLock(settingKey, rev)) {
            try {
                const current = game.settings.get(namespace, key);
                if (!_valuesEqual(current, value)) {
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

    if (type === "hard") {
        _hardLockedKeys.add(lockKey);
        try {
            const current = game.keybindings.get(namespace, action);
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
            console.warn(`${MODULE_ID} | Failed to enforce hard lock on keybinding ${actionKey}:`, err);
        }
    } else if (type === "soft") {
        if (shouldApplySoftLock(lockKey, rev)) {
            try {
                const current = game.keybindings.get(namespace, action);
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
            if (lock && !_valuesEqual(value, lock.value)) {
                if (lock.type === "hard") {
                    await setLock(settingKey, lock.type, value);
                    game.socket.emit(SOCKET_CHANNEL, { action: "apply-locks" });
                } else if (lock.type === "soft") {
                    _queueSoftLockUpdate(settingKey, value);
                }
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

            if (lock && _valuesEqual(value, lock.value)) {
                return wrapped(namespace, key, value, ...rest);
            }

            const name = config.name
                ? game.i18n.localize(config.name)
                : settingKey;
            ui.notifications.warn(game.i18n.format("NSL.Notifications.HardLockBlocked", { name }));

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
                if (lock.type === "hard") {
                    await setLock(lockKey, lock.type, bindings);
                    game.socket.emit(SOCKET_CHANNEL, { action: "apply-locks" });
                } else if (lock.type === "soft") {
                    _queueSoftLockUpdate(lockKey, bindings);
                }
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
            ui.notifications.warn(game.i18n.format("NSL.Notifications.HardLockBlocked", { name }));

            if (lock) return wrapped(namespace, action, lock.value, ...rest);
            return;
        }

        return wrapped(namespace, action, bindings, ...rest);
    }, "WRAPPER");
}

/**
 * Register the socket listener for GM broadcasts.
 * Only non-GM clients re-apply locks on socket messages.
 */
function _registerSocketListener() {
    game.socket.on(SOCKET_CHANNEL, async (data) => {
        if (data?.action === "apply-locks") {
            // Lock manager is the sender — they don't need to re-apply their own changes
            if (canManageLocks()) return;

            console.log(`${MODULE_ID} | Received lock update from GM, re-applying...`);
            ui.notifications?.info(game.i18n.localize("NSL.Notifications.LocksEnforced"));
            await applyLocks();

            // Re-render open config windows using the V14 application registry
            _rerenderOpenApp("SettingsConfig");
            _rerenderOpenApp("ControlsConfig");
        }
    });
}

/**
 * Find and re-render an open ApplicationV2 by class name.
 * Uses foundry.applications.instances (V14) or falls back to ui.windows.
 */
function _rerenderOpenApp(className) {
    try {
        // V14: foundry.applications.instances is a Map of all active ApplicationV2 instances
        if (foundry.applications?.instances) {
            for (const app of foundry.applications.instances.values()) {
                if (app.constructor.name === className) {
                    app.render();
                    return;
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
 * Uses foundry.utils.objectsEqual when available (V14+), falls back to
 * JSON.stringify comparison.
 */
function _valuesEqual(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    try {
        // Prefer Foundry's built-in deep comparison (order-independent for objects)
        if (typeof foundry?.utils?.objectsEqual === "function") {
            return foundry.utils.objectsEqual(a, b);
        }
        return JSON.stringify(a) === JSON.stringify(b);
    } catch {
        return false;
    }
}
