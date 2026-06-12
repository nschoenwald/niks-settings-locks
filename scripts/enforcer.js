/**
 * Nik's Settings Locks — Enforcer
 *
 * Client-side enforcement logic. Responsibilities:
 * 1. On "ready": apply all locked values from the world lock map.
 * 2. Runtime: wrap ClientSettings.prototype.set to block hard-locked changes.
 * 3. Socket listener: re-enforce when the GM changes locks.
 */

import {
    MODULE_ID, SOCKET_CHANNEL,
    getLockMap, getLock, shouldApplySoftLock, markSoftLockApplied
} from "./lock-store.js";

/** Track which settings are currently hard-locked for runtime prevention. */
const _hardLockedKeys = new Set();

/** Flag to bypass our own set() wrapper when we apply locks internally. */
let _bypassEnforcement = false;

// ---------------------------------------------------------------------------
//  Public API
// ---------------------------------------------------------------------------

/**
 * Initialize enforcement. Call once during module setup.
 * - Wraps game.settings.set for runtime prevention.
 * - Registers the socket listener.
 */
export function initEnforcer() {
    _wrapSettingsSet();
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

    for (const [settingKey, lock] of entries) {
        const { type, value, rev } = lock;
        const [namespace, ...keyParts] = settingKey.split(".");
        const key = keyParts.join(".");

        // Check the setting exists and is client/user scoped
        const config = game.settings.settings.get(settingKey);
        if (!config) continue;
        if (config.scope !== "client" && config.scope !== "user") continue;

        // Hard locks: always enforce
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
                    applied++;
                    if (config.requiresReload) needsReload = true;
                }
            } catch (err) {
                console.warn(`${MODULE_ID} | Failed to enforce hard lock on ${settingKey}:`, err);
            }
        }

        // Soft locks: only apply if the revision is newer than what this client has seen
        else if (type === "soft") {
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
                        applied++;
                        if (config.requiresReload) needsReload = true;
                    }
                    markSoftLockApplied(settingKey, rev);
                } catch (err) {
                    console.warn(`${MODULE_ID} | Failed to enforce soft lock on ${settingKey}:`, err);
                }
            }
        }
    }

    if (applied > 0) {
        console.log(`${MODULE_ID} | Applied ${applied} locked setting(s).`);
        const localeKey = applied === 1 ? "NSL.Notifications.LocksAppliedOne" : "NSL.Notifications.LocksAppliedMany";
        ui.notifications?.info(game.i18n.format(localeKey, { count: applied }));
    }

    if (needsReload) {
        ui.notifications?.warn(game.i18n.localize("NSL.Notifications.ReloadRequired"));
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
        if (lock.type === "hard") _hardLockedKeys.add(key);
    }
}

/**
 * Check if a setting is currently hard-locked.
 * @param {string} settingKey  "namespace.key"
 * @returns {boolean}
 */
export function isHardLocked(settingKey) {
    return _hardLockedKeys.has(settingKey);
}

// ---------------------------------------------------------------------------
//  Internals
// ---------------------------------------------------------------------------

/**
 * Wrap ClientSettings.prototype.set to block hard-locked setting changes.
 * Uses libWrapper for safe, compatible method wrapping in V14.
 */
function _wrapSettingsSet() {
    libWrapper.register(MODULE_ID, "ClientSettings.prototype.set", function (wrapped, namespace, key, value, ...rest) {
        if (_bypassEnforcement) return wrapped(namespace, key, value, ...rest);

        // GMs are exempt from runtime enforcement — they manage locks.
        // Locks are still applied to GM clients on page load via applyLocks().
        if (game.user?.isGM) return wrapped(namespace, key, value, ...rest);

        const settingKey = `${namespace}.${key}`;
        if (_hardLockedKeys.has(settingKey)) {
            const lock = getLock(settingKey);

            // Allow writes that match the locked value (e.g. SettingsConfig
            // re-submitting all settings on save). Only block actual changes.
            if (lock && _valuesEqual(value, lock.value)) {
                return wrapped(namespace, key, value, ...rest);
            }

            const config = game.settings.settings.get(settingKey);
            const name = config?.name
                ? game.i18n.localize(config.name)
                : settingKey;
            ui.notifications.warn(game.i18n.format("NSL.Notifications.HardLockBlocked", { name }));

            // Write the locked value instead of the attempted value,
            // so the form submission completes without errors.
            if (lock) return wrapped(namespace, key, lock.value, ...rest);
            return;
        }

        return wrapped(namespace, key, value, ...rest);
    }, "WRAPPER");
}

/**
 * Register the socket listener for GM broadcasts.
 */
function _registerSocketListener() {
    game.socket.on(SOCKET_CHANNEL, async (data) => {
        if (data?.action === "apply-locks") {
            console.log(`${MODULE_ID} | Received lock update from GM, re-applying...`);
            ui.notifications?.info(game.i18n.localize("NSL.Notifications.LocksEnforced"));
            await applyLocks();
            // Re-render the settings config if it's open (V14 ApplicationV2 API)
            try {
                for (const app of SettingsConfig.instances()) {
                    app.render();
                    break;
                }
            } catch {
                // SettingsConfig may not be open
            }
        }
    });
}

/**
 * Deep equality check for setting values.
 */
function _valuesEqual(a, b) {
    if (a === b) return true;
    try {
        return JSON.stringify(a) === JSON.stringify(b);
    } catch {
        return false;
    }
}
