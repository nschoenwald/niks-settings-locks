/**
 * Nik's Settings Locks — Lock Change Log
 *
 * Writes what changed in the lock map to the console on every client, whoever made the change:
 * live when the lock map is saved, and on load for changes made since this browser last saw the locks.
 */

import { MODULE_ID, KB_PREFIX, getLockMap } from "./lock-store.js";
import { formatValue } from "./format.js";

/** The lock map as last seen on this client; null until the world is ready. */
let _lastLockMap = null;

/** localStorage key of the lock map this browser last saw in this world. */
function _storageKey() {
    return `${MODULE_ID}.lastLockMap.${game.world.id}`;
}

/**
 * Remember the lock map in this browser for the diff on the next load.
 * @param {object} map
 */
function _storeLockMap(map) {
    try {
        localStorage.setItem(_storageKey(), JSON.stringify(map));
    } catch {
        // Storage unavailable or full: the next load logs nothing
    }
}

/**
 * The lock map this browser last saw in this world.
 * @returns {object|null}  null on the first load in this browser
 */
function _readStoredLockMap() {
    try {
        const stored = localStorage.getItem(_storageKey());
        return stored ? JSON.parse(stored) : null;
    } catch {
        return null;
    }
}

/**
 * Remember the current lock map as the base for the next diff, and log what changed since this browser last saw
 * the locks. Call on "ready", before the locks are applied.
 */
export function initLockLog() {
    const current = getLockMap();
    const stored = _readStoredLockMap();
    _lastLockMap = current;
    _storeLockMap(current);
    if (!stored) return;
    const lines = _diffLines(stored, current);
    if (lines.length) console.log(`${MODULE_ID} | Locks changed since your last session (${lines.length}):\n  ${lines.join("\n  ")}`);
}

/**
 * Format a lock or setting value for the console: key combos for keybindings, JSON for everything else.
 * @param {string} key  Lock key ("namespace.key" or "kb:namespace.action")
 * @param {*} value
 * @returns {string}
 */
export function formatLogValue(key, value) {
    if (key.startsWith(KB_PREFIX)) {
        try {
            return formatValue(value, true);
        } catch {
            // Fall through to JSON when the bindings can't be humanized
        }
    }
    try {
        return JSON.stringify(value) ?? String(value);
    } catch {
        return String(value);
    }
}

/**
 * One console line per lock that differs between two lock maps.
 * @param {object} before
 * @param {object} after
 * @returns {string[]}
 */
function _diffLines(before, after) {
    const lines = [];
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    for (const key of keys) {
        const prev = before[key];
        const next = after[key];
        if (!prev) {
            lines.push(`+ ${key}: added ${next.type} lock = ${formatLogValue(key, next.value)}`);
        } else if (!next) {
            lines.push(`- ${key}: removed (was ${prev.type} lock = ${formatLogValue(key, prev.value)})`);
        } else if (prev.type !== next.type || !foundry.utils.equals(prev.value, next.value)) {
            lines.push(`~ ${key}: ${prev.type} lock = ${formatLogValue(key, prev.value)} → ${next.type} lock = ${formatLogValue(key, next.value)}`);
        } else if (prev.rev !== next.rev) {
            lines.push(`↻ ${key}: ${next.type} lock re-sent = ${formatLogValue(key, next.value)}`);
        }
    }
    return lines;
}

/**
 * Log the differences between the previous and the new lock map. `onChange` handler of the lock map setting.
 * @param {string} [userId]  The user who saved the lock map
 */
export function logLockMapChange(userId) {
    if (_lastLockMap === null) return;
    const before = _lastLockMap;
    const after = getLockMap();
    _lastLockMap = after;
    _storeLockMap(after);

    const lines = _diffLines(before, after);
    if (!lines.length) return;
    const user = game.users.get(userId)?.name ?? "unknown user";
    console.log(`${MODULE_ID} | Locks updated by ${user} (${lines.length}):\n  ${lines.join("\n  ")}`);
}
