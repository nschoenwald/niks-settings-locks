/**
 * Nik's Settings Locks — Lock Store
 *
 * Data layer for managing the lock map stored in a world setting.
 * The lock map is a plain object keyed by "namespace.key" with entries:
 *   { type: "soft"|"hard"|"player", value: any, rev: number }
 *
 * Soft lock revisions are tracked per-client in localStorage so that
 * a soft lock is only applied once per revision — players can override
 * permanently until the GM bumps the revision.
 */

export const MODULE_ID = "niks-settings-locks";
export const SETTING_LOCK_MAP = "lockMap";
export const SETTING_MIN_ROLE = "minimumRole";
export const SETTING_ALLOW_SETTINGS_MODIFY = "allowSettingsModify";
export const SOCKET_CHANNEL = `module.${MODULE_ID}`;
export const KB_PREFIX = "kb:";

/** All valid lock types. */
export const LOCK_TYPES = ["soft", "hard", "player"];

/** User query (CONFIG.queries) a lock manager without world-setting permission sends to the active GM. */
export const QUERY_SET_LOCK_MAP = `${MODULE_ID}.setLockMap`;

/** Hook fired on a client after it re-applied locks from a GM broadcast. Receives the Set of changed lock keys. */
export const LOCKS_CHANGED_HOOK = `${MODULE_ID}.locksChanged`;

const LOCAL_STORAGE_KEY = `${MODULE_ID}.softLockRevs`;

// ---------------------------------------------------------------------------
//  Role Check
// ---------------------------------------------------------------------------

/**
 * Check whether the current user has permission to manage locks.
 * @returns {boolean}
 */
export function canManageLocks() {
    return canUserManageLocks(game.user);
}

/**
 * Check whether a user may manage locks: their role is at least the configured minimum role,
 * or (unless the GM turned it off) they have Foundry's "Modify Configuration Settings" permission.
 * Falls back to GM-only if the settings haven't been registered yet.
 * @param {User} user
 * @returns {boolean}
 */
export function canUserManageLocks(user) {
    if (!user) return false;
    let minRole = CONST.USER_ROLES.GAMEMASTER;
    let allowSettingsModify = false;
    try {
        minRole = game.settings.get(MODULE_ID, SETTING_MIN_ROLE);
        allowSettingsModify = game.settings.get(MODULE_ID, SETTING_ALLOW_SETTINGS_MODIFY);
    } catch {
        // Settings not yet registered — fall back to GM-only
    }
    if (user.role >= minRole) return true;
    return allowSettingsModify && user.can("SETTINGS_MODIFY");
}

// ---------------------------------------------------------------------------
//  Lock Map CRUD
// ---------------------------------------------------------------------------

/**
 * Read the full lock map from world settings.
 * @returns {Object<string, {type: string, value: *, rev: number}>}
 */
export function getLockMap() {
    let map;
    try {
        map = foundry.utils.deepClone(game.settings.get(MODULE_ID, SETTING_LOCK_MAP) ?? {});
    } catch {
        return {};
    }
    for (const [key, lock] of Object.entries(map)) {
        if (key.startsWith(KB_PREFIX)) lock.value = stripUneditableBindings(key.slice(KB_PREFIX.length), lock.value);
    }
    return map;
}

/**
 * Persist the full lock map to world settings.
 * Lock managers who can't write world settings (e.g. Trusted Players) ask the active GM to save it.
 * @param {Object} map
 */
export async function setLockMap(map) {
    if (game.user.can("SETTINGS_MODIFY")) {
        await game.settings.set(MODULE_ID, SETTING_LOCK_MAP, map ?? {});
        return;
    }

    const gm = game.users.activeGM;
    if (!gm) {
        ui.notifications.warn(game.i18n.localize("NSL.Notifications.NoActiveGM"));
        throw new Error(`${MODULE_ID} | No active GM to save the lock map`);
    }
    await gm.query(QUERY_SET_LOCK_MAP, { map: map ?? {} });
}

/**
 * Register the query handler that saves the lock map on behalf of a lock manager.
 * Runs on the active GM's client; the querying user comes from the server, so it can be trusted.
 */
export function registerLockMapQuery() {
    CONFIG.queries[QUERY_SET_LOCK_MAP] = async ({ map } = {}, { user } = {}) => {
        if (!canUserManageLocks(user)) throw new Error("You are not allowed to manage settings locks.");
        if (foundry.utils.getType(map) !== "Object") throw new Error("Invalid lock map.");
        for (const [key, entry] of Object.entries(map)) {
            if (!LOCK_TYPES.includes(entry?.type)) throw new Error(`Invalid lock entry: ${key}`);
        }
        await game.settings.set(MODULE_ID, SETTING_LOCK_MAP, map);
        return true;
    };
}

/**
 * Get the lock entry for a single setting.
 * @param {string} settingKey  e.g. "core.language"
 * @returns {{type: string, value: *, rev: number}|null}
 */
export function getLock(settingKey) {
    let lock;
    try {
        lock = game.settings.get(MODULE_ID, SETTING_LOCK_MAP)?.[settingKey];
    } catch {
        return null;
    }
    if (!lock) return null;
    // Only this entry is cloned: the set() wrappers call this for every setting change
    lock = foundry.utils.deepClone(lock);
    if (settingKey.startsWith(KB_PREFIX)) lock.value = stripUneditableBindings(settingKey.slice(KB_PREFIX.length), lock.value);
    return lock;
}

/**
 * Set or update a lock for a single setting.
 * Automatically increments the revision number.
 * @param {string} settingKey
 * @param {"soft"|"hard"|"player"} type
 * @param {*} value
 */
export async function setLock(settingKey, type, value) {
    const map = getLockMap();
    const existing = map[settingKey];
    const rev = (existing?.rev ?? 0) + 1;
    map[settingKey] = { type, value, rev };
    await setLockMap(map);
}

/**
 * Remove a lock for a single setting.
 * @param {string} settingKey
 */
export async function removeLock(settingKey) {
    const map = getLockMap();
    if (!(settingKey in map)) return;
    delete map[settingKey];
    await setLockMap(map);
    // Clean up the soft-lock revision tracking for this key
    clearSoftLockRev(settingKey);
}

// ---------------------------------------------------------------------------
//  Keybinding Values
// ---------------------------------------------------------------------------

/**
 * Read the editable part of a keybinding action's current bindings, which is what a lock holds.
 * game.keybindings.get() returns the action's uneditable bindings followed by its editable ones,
 * while game.keybindings.set() stores whatever it is given as the editable bindings.
 * @param {string} actionKey  "namespace.action"
 * @returns {object[]}
 */
export function getEditableBindings(actionKey) {
    const [namespace, ...actionParts] = actionKey.split(".");
    const bindings = game.keybindings.get(namespace, actionParts.join("."));
    const uneditable = game.keybindings.actions.get(actionKey)?.uneditable ?? [];
    return bindings.slice(uneditable.length);
}

/**
 * Remove an action's uneditable bindings from the front of a locked bindings list.
 * Locks made before 14.3.2 included them, so the locked value never matched the client's value: it was applied
 * again on every load and each time stored another copy of the uneditable bindings. Repeated copies are removed too.
 * Clients that stored such copies get the clean value once on their next load.
 * @param {string} actionKey  "namespace.action"
 * @param {object[]} bindings
 * @returns {object[]}
 */
export function stripUneditableBindings(actionKey, bindings) {
    const uneditable = game.keybindings?.actions?.get(actionKey)?.uneditable ?? [];
    if (!uneditable.length || !Array.isArray(bindings)) return bindings;
    const sameBinding = (a, b) => a?.key === b?.key && foundry.utils.equals(a?.modifiers ?? [], b?.modifiers ?? []);
    let start = 0;
    while (uneditable.every((binding, i) => sameBinding(binding, bindings[start + i]))) start += uneditable.length;
    return start ? bindings.slice(start) : bindings;
}

// ---------------------------------------------------------------------------
//  Soft-Lock Revision Tracking (client-side)
// ---------------------------------------------------------------------------

/**
 * Get the locally stored soft-lock revision map.
 * @returns {Object<string, number>}
 */
export function getSoftLockRevs() {
    try {
        const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

/**
 * Mark a soft lock as applied for the current client.
 * @param {string} settingKey
 * @param {number} rev
 */
export function markSoftLockApplied(settingKey, rev) {
    const revs = getSoftLockRevs();
    revs[settingKey] = rev;
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(revs));
}

/**
 * Check whether a soft lock needs to be applied for this client.
 * @param {string} settingKey
 * @param {number} rev
 * @returns {boolean}
 */
export function shouldApplySoftLock(settingKey, rev) {
    const revs = getSoftLockRevs();
    return (revs[settingKey] ?? 0) < rev;
}

/**
 * Remove a soft lock rev entry (when the lock is removed).
 * @param {string} settingKey
 */
export function clearSoftLockRev(settingKey) {
    const revs = getSoftLockRevs();
    delete revs[settingKey];
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(revs));
}

// ---------------------------------------------------------------------------
//  Re-enforce Soft Locks
// ---------------------------------------------------------------------------

/**
 * Bump the revision number of every soft lock so that all player clients
 * will re-apply them on their next login/reload.
 * @returns {Promise<number>} The number of soft locks re-enforced.
 */
export async function reenforceSoftLocks() {
    const map = getLockMap();
    let count = 0;
    for (const lock of Object.values(map)) {
        if (lock.type === "soft") {
            lock.rev = (lock.rev ?? 0) + 1;
            count++;
        }
    }
    if (count > 0) await setLockMap(map);
    return count;
}

// ---------------------------------------------------------------------------
//  Export / Import
// ---------------------------------------------------------------------------

const EXPORT_FORMAT_VERSION = 1;

/**
 * Export the current lock map as a JSON blob and trigger a download.
 */
export function exportLocks() {
    const map = getLockMap();
    const keys = Object.keys(map);
    if (!keys.length) {
        ui.notifications.warn(game.i18n.localize("NSL.Notifications.NoLocksToExport"));
        return;
    }

    const payload = {
        format: MODULE_ID,
        version: EXPORT_FORMAT_VERSION,
        exportedAt: new Date().toISOString(),
        locks: map
    };

    foundry.utils.saveDataToFile(JSON.stringify(payload, null, 2), "application/json",
        `${game.i18n.localize("NSL.Export.Filename")}-${Date.now()}.json`);

    ui.notifications.info(game.i18n.localize("NSL.Notifications.ExportSuccess"));
}

/**
 * Import locks from a JSON file. Prompts for file selection.
 * The caller is responsible for applying the imported locks on this client (see applyLocks).
 * @returns {Promise<number>} The number of imported locks (0 if cancelled or failed)
 */
export async function importLocks() {
    return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        // Closing the file picker without choosing a file fires "cancel" instead of "change"
        input.addEventListener("cancel", () => resolve(0));
        input.addEventListener("change", async (event) => {
            const file = event.target.files?.[0];
            if (!file) return resolve(0);

            try {
                const text = await file.text();
                const data = JSON.parse(text);

                // Validate format
                if (data?.format !== MODULE_ID || foundry.utils.getType(data.locks) !== "Object") {
                    ui.notifications.error(game.i18n.localize("NSL.Import.InvalidFormat"));
                    return resolve(0);
                }

                const incoming = data.locks;
                const count = Object.keys(incoming).length;

                // Confirm with the user
                const confirmKey = count === 1 ? "NSL.Import.ConfirmMessageOne" : "NSL.Import.ConfirmMessageMany";
                const confirmed = await foundry.applications.api.DialogV2.confirm({
                    window: { title: game.i18n.localize("NSL.Import.DialogTitle") },
                    content: `<p>${game.i18n.format(confirmKey, { count })}</p>`,
                    defaultYes: false
                });

                if (!confirmed) return resolve(0);

                // Merge into existing map (only valid entries)
                const map = getLockMap();
                let imported = 0;
                for (const [key, entry] of Object.entries(incoming)) {
                    // Validate entry structure
                    if (!entry || !LOCK_TYPES.includes(entry.type)) {
                        console.warn(`${MODULE_ID} | Skipping invalid lock entry: ${key}`, entry);
                        continue;
                    }
                    // Bump rev so soft locks re-apply
                    const existingRev = map[key]?.rev ?? 0;
                    map[key] = {
                        type: entry.type,
                        value: entry.value,
                        rev: existingRev + 1
                    };
                    imported++;
                }

                await setLockMap(map);

                // Broadcast to all connected clients
                game.socket.emit(SOCKET_CHANNEL, { action: "apply-locks" });

                const successKey = imported === 1 ? "NSL.Notifications.ImportSuccessOne" : "NSL.Notifications.ImportSuccessMany";
                ui.notifications.info(game.i18n.format(successKey, { count: imported }));
                return resolve(imported);
            } catch (err) {
                console.error(`${MODULE_ID} | Import failed:`, err);
                ui.notifications.error(game.i18n.format("NSL.Notifications.ImportFailed", { error: err.message }));
            }
            resolve(0);
        });
        input.click();
    });
}
