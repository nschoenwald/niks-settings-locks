import { MODULE_ID, KB_PREFIX, setLock, SOCKET_CHANNEL } from "./lock-store.js";
import { refreshHardLockSet } from "./enforcer.js";

/**
 * Prompt the GM with a list of soft-locked settings they just changed.
 * Allows them to choose whether to update the global soft lock for players,
 * or keep it as a local-only change.
 * 
 * @param {Map<string, *>} updates Map of lockKey -> newValue
 */
export async function promptSoftLockUpdates(updates) {
    if (!updates || updates.size === 0) return;

    let content = `<p>${game.i18n.localize("NSL.Prompt.SoftLockUpdateDesc")}</p>`;
    content += `<form class="nsl-soft-lock-prompt-form" style="margin-top: 10px;">`;
    
    for (const [key, value] of updates.entries()) {
        let name = key;
        
        // Try to find a human-readable name
        if (key.startsWith(KB_PREFIX)) {
            const actionKey = key.slice(KB_PREFIX.length);
            const actionConfig = game.keybindings.actions.get(actionKey);
            if (actionConfig?.name) name = game.i18n.localize(actionConfig.name);
        } else {
            const settingConfig = game.settings.settings.get(key);
            if (settingConfig?.name) name = game.i18n.localize(settingConfig.name);
        }

        // Display value
        let displayValue = String(value);
        if (typeof value === "object") {
            displayValue = "[Object]";
        }

        content += `
            <div class="form-group" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; border-bottom: 1px solid var(--color-border-light-2); padding-bottom: 4px;">
                <label style="flex: 1; font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 10px;" title="${key}">
                    ${name}
                    <div style="font-weight: normal; font-size: 0.85em; color: var(--color-text-dark-secondary);">
                        ${game.i18n.localize("NSL.Prompt.NewValue")}: <code>${displayValue}</code>
                    </div>
                </label>
                <div class="form-fields" style="flex: 0 0 auto;">
                    <label class="checkbox" style="display: flex; align-items: center; gap: 5px;">
                        <input type="checkbox" name="${key}" checked>
                        ${game.i18n.localize("NSL.Prompt.UpdateLock")}
                    </label>
                </div>
            </div>
        `;
    }
    
    content += `</form>`;

    const result = await foundry.applications.api.DialogV2.prompt({
        window: { title: game.i18n.localize("NSL.Prompt.SoftLockUpdateTitle") },
        content: content,
        ok: {
            label: game.i18n.localize("NSL.Prompt.ApplySelected"),
            icon: "fa-solid fa-check",
            callback: (event, button, dialog) => {
                const formData = new FormData(dialog.element.querySelector("form"));
                const selected = [];
                for (const key of updates.keys()) {
                    if (formData.get(key) === "on") {
                        selected.push(key);
                    }
                }
                return selected;
            }
        },
        cancel: {
            label: game.i18n.localize("Cancel"),
            icon: "fa-solid fa-times",
            callback: () => []
        },
        rejectClose: false
    });

    if (!result || result.length === 0) return;

    let applied = 0;
    for (const key of result) {
        const value = updates.get(key);
        if (value !== undefined) {
            await setLock(key, "soft", value);
            applied++;
        }
    }

    if (applied > 0) {
        refreshHardLockSet();
        game.socket.emit(SOCKET_CHANNEL, { action: "apply-locks" });
        ui.notifications.info(game.i18n.format("NSL.Notifications.SoftLocksUpdated", { count: applied }));
    }
}
