/**
 * Nik's Settings Locks — Lock Update Prompt
 *
 * Asks the GM what to do after they changed settings or controls that are locked:
 * - "soft" (Suggested value): ticked items send the new value to players; unticked ones stay personal.
 * - "hard" (Locked for everyone): ticked items update the lock for everyone; unticked ones are undone,
 *   because a value locked for everyone also applies to the GM.
 */

import { KB_PREFIX, getLock, setLock, SOCKET_CHANNEL } from "./lock-store.js";
import { formatValue } from "./format.js";

/**
 * @param {"soft"|"hard"} type      The lock type of every item in `updates`
 * @param {Map<string, *>} updates  Map of lockKey -> the GM's new value
 * @param {object} [options]
 * @param {(keys: string[]) => Promise<void>} [options.onDecline]  Called with the keys the GM didn't update
 */
export async function promptLockUpdates(type, updates, { onDecline } = {}) {
    if (!updates || updates.size === 0) return;

    const prefix = type === "hard" ? "NSL.Prompt.Hard" : "NSL.Prompt.Soft";
    const keys = [...updates.keys()];
    const esc = foundry.utils.escapeHTML;

    let content = `<p>${game.i18n.localize(`${prefix}Desc`)}</p><div class="nsl-update-prompt">`;
    keys.forEach((key, index) => {
        const isKeybinding = key.startsWith(KB_PREFIX);
        const oldValue = formatValue(getLock(key)?.value, isKeybinding);
        const newValue = formatValue(updates.get(key), isKeybinding);
        content += `
            <div class="form-group">
                <label for="nsl-update-${index}">
                    ${esc(_displayName(key))}
                    <p class="hint">${esc(oldValue)} → <strong>${esc(newValue)}</strong></p>
                </label>
                <div class="form-fields">
                    <input type="checkbox" id="nsl-update-${index}" name="nsl-update-${index}" checked
                           aria-label="${esc(game.i18n.localize(`${prefix}Checkbox`))}">
                </div>
            </div>`;
    });
    content += `</div>`;

    const selected = await foundry.applications.api.DialogV2.wait({
        window: { title: game.i18n.localize(`${prefix}Title`), icon: type === "hard" ? "fa-solid fa-lock" : "fa-solid fa-thumbtack" },
        position: { width: 480 },
        content,
        buttons: [
            {
                action: "apply",
                label: game.i18n.localize(`${prefix}Apply`),
                icon: "fa-solid fa-check",
                default: true,
                callback: (event, button) => keys.filter((_key, index) => button.form.elements[`nsl-update-${index}`]?.checked)
            },
            {
                action: "decline",
                label: game.i18n.localize(`${prefix}Decline`),
                icon: type === "hard" ? "fa-solid fa-rotate-left" : "fa-solid fa-user",
                callback: () => []
            }
        ],
        rejectClose: false
    }) ?? [];

    let applied = 0;
    for (const key of selected) {
        await setLock(key, type, updates.get(key));
        applied++;
    }
    if (applied > 0) {
        game.socket.emit(SOCKET_CHANNEL, { action: "apply-locks" });
        const notifKey = type === "hard" ? "NSL.Notifications.HardLocksUpdated" : "NSL.Notifications.SoftLocksUpdated";
        ui.notifications.info(game.i18n.format(notifKey, { count: applied }));
    }

    const declined = keys.filter(key => !selected.includes(key));
    if (declined.length && onDecline) await onDecline(declined);
}

/**
 * Human-readable name for a setting or keybinding lock key.
 */
function _displayName(key) {
    if (key.startsWith(KB_PREFIX)) {
        const actionConfig = game.keybindings.actions.get(key.slice(KB_PREFIX.length));
        return actionConfig?.name ? game.i18n.localize(actionConfig.name) : key;
    }
    const settingConfig = game.settings.settings.get(key);
    return settingConfig?.name ? game.i18n.localize(settingConfig.name) : key;
}
