/**
 * Nik's Settings Locks — Lock Store
 *
 * Data layer for managing the lock map stored in a world setting.
 * The lock map is a plain object keyed by "namespace.key" with entries:
 *   { type: "soft"|"hard", value: any, rev: number }
 *
 * Soft lock revisions are tracked per-client in localStorage so that
 * a soft lock is only applied once per revision — players can override
 * permanently until the GM bumps the revision.
 */

export const MODULE_ID = "niks-settings-locks";
export const SETTING_LOCK_MAP = "lockMap";
export const SOCKET_CHANNEL = `module.${MODULE_ID}`;
export const KB_PREFIX = "kb:";

const LOCAL_STORAGE_KEY = `${MODULE_ID}.softLockRevs`;

// ---------------------------------------------------------------------------
//  Lock Map CRUD
// ---------------------------------------------------------------------------

/**
 * Read the full lock map from world settings.
 * @returns {Object<string, {type: string, value: *, rev: number}>}
 */
export function getLockMap() {
    try {
        return foundry.utils.deepClone(game.settings.get(MODULE_ID, SETTING_LOCK_MAP) ?? {});
    } catch {
        return {};
    }
}

/**
 * Persist the full lock map to world settings.
 * @param {Object} map
 */
export async function setLockMap(map) {
    await game.settings.set(MODULE_ID, SETTING_LOCK_MAP, map ?? {});
}

/**
 * Get the lock entry for a single setting.
 * @param {string} settingKey  e.g. "core.language"
 * @returns {{type: string, value: *, rev: number}|null}
 */
export function getLock(settingKey) {
    const map = getLockMap();
    return map[settingKey] ?? null;
}

/**
 * Set or update a lock for a single setting.
 * Automatically increments the revision number.
 * @param {string} settingKey
 * @param {"soft"|"hard"} type
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
    for (const [key, lock] of Object.entries(map)) {
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

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${game.i18n.localize("NSL.Export.Filename")}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    ui.notifications.info(game.i18n.localize("NSL.Notifications.ExportSuccess"));
}

/**
 * Import locks from a JSON file. Prompts for file selection.
 * @returns {Promise<void>}
 */
export async function importLocks() {
    return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.addEventListener("change", async (event) => {
            const file = event.target.files?.[0];
            if (!file) return resolve();

            try {
                const text = await file.text();
                const data = JSON.parse(text);

                // Validate format
                if (data?.format !== MODULE_ID || typeof data?.locks !== "object") {
                    ui.notifications.error(game.i18n.localize("NSL.Import.InvalidFormat"));
                    return resolve();
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

                if (!confirmed) return resolve();

                // Merge into existing map
                const map = getLockMap();
                for (const [key, entry] of Object.entries(incoming)) {
                    // Bump rev so soft locks re-apply
                    const existingRev = map[key]?.rev ?? 0;
                    map[key] = {
                        type: entry.type,
                        value: entry.value,
                        rev: existingRev + 1
                    };
                }

                await setLockMap(map);

                // Broadcast to all connected clients
                game.socket.emit(SOCKET_CHANNEL, { action: "apply-locks" });

                const successKey = count === 1 ? "NSL.Notifications.ImportSuccessOne" : "NSL.Notifications.ImportSuccessMany";
                ui.notifications.info(game.i18n.format(successKey, { count }));
            } catch (err) {
                console.error(`${MODULE_ID} | Import failed:`, err);
                ui.notifications.error(game.i18n.format("NSL.Notifications.ImportFailed", { error: err.message }));
            }
            resolve();
        });
        input.click();
    });
}
