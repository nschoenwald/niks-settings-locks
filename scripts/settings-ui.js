/**
 * Nik's Settings Locks — Settings UI
 *
 * Injects lock toggle icons into the SettingsConfig application
 * for GM users, and shows lock indicators for players.
 */

import {
    MODULE_ID, SOCKET_CHANNEL,
    getLockMap, setLockMap,
    exportLocks, importLocks, reenforceSoftLocks,
    canManageLocks, LOCKS_CHANGED_HOOK
} from "./lock-store.js";
import { refreshHardLockSet, applyLocks } from "./enforcer.js";
import { renderConflictBanner, shouldShowConflictBanner } from "./conflict-guard.js";
import { createLockIcon, updateLockIcon, bindLockPicker, changeLockType } from "./lock-picker.js";

// ---------------------------------------------------------------------------
//  Public API
// ---------------------------------------------------------------------------

/**
 * Initialize the settings UI hooks.
 */
export function initSettingsUI() {
    Hooks.on("renderSettingsConfig", _onRenderSettingsConfig);
    Hooks.on(LOCKS_CHANGED_HOOK, _refreshOpenSettingsConfigs);
}

// ---------------------------------------------------------------------------
//  Hook Handler
// ---------------------------------------------------------------------------

/**
 * Called whenever SettingsConfig renders. Injects lock icons and controls.
 * @param {SettingsConfig} app
 * @param {HTMLElement} html  The application element
 */
function _onRenderSettingsConfig(app, html) {
    const map = getLockMap();
    const isManager = canManageLocks();

    // Conflict Guard: for users who can resolve the conflict, show the warning banner and hide
    // Carolingian UI's duplicate lock icons. Players keep Carolingian's icons, because they explain
    // the inputs Carolingian UI still disables until the GM resolves the conflict.
    if (shouldShowConflictBanner()) {
        html.querySelectorAll(".sk-lock").forEach(el => el.remove());
        const bannerTarget = html.querySelector(".main") || html.querySelector("form") || html;
        renderConflictBanner(bannerTarget, () => app.render());
    }

    // Collect all lockable setting keys for matching
    const lockableKeys = new Set();
    for (const [key, config] of game.settings.settings.entries()) {
        if (config.scope === "client" || config.scope === "user") {
            lockableKeys.add(key);
        }
    }

    const processedKeys = new Set();

    // Strategy 1: form-groups with data-setting-id (common in V14 SettingsConfig)
    const formGroups = html.querySelectorAll(".form-group[data-setting-id]");
    for (const group of formGroups) {
        const settingKey = group.dataset.settingId;
        if (!settingKey || !lockableKeys.has(settingKey)) continue;
        processedKeys.add(settingKey);
        _processFormGroup(group, settingKey, map, isManager);
    }

    // Strategy 2: fallback for any remaining lockable settings — find inputs/selects/custom-elements
    // whose name matches "namespace.key" and walk up to their .form-group parent
    const inputs = html.querySelectorAll("[name]");
    for (const input of inputs) {
        const name = input.getAttribute("name");
        if (!name || !lockableKeys.has(name) || processedKeys.has(name)) continue;

        const group = input.closest(".form-group");
        if (!group) continue;

        processedKeys.add(name);
        _processFormGroup(group, name, map, isManager);
    }

    if (isManager) {
        // Lock picker for every lock icon in this window (bound once per window)
        bindLockPicker(html, (icon, type) => _onPickLock(icon, type));
        // Add export/import buttons to our module's settings section
        _injectModuleButtons(app, html);
    }
}

/**
 * Process a single form-group: inject lock icon and apply disabling.
 */
function _processFormGroup(group, settingKey, map, isManager) {
    const lock = map[settingKey] ?? null;
    _injectLockIcon(group, settingKey, lock, isManager);
    _applyGroupLockState(group, lock, isManager);
}

/**
 * Disable or re-enable a form-group's inputs according to its lock.
 */
function _applyGroupLockState(group, lock, isManager) {
    // Disable inputs:
    // - "hard": disabled for ALL users
    // - "player": disabled for non-managers only (managers keep input enabled for personal value)
    const isHard = lock?.type === "hard";
    const isPlayerLocked = !isManager && lock?.type === "player";
    if (isHard || isPlayerLocked) {
        _disableSettingInputs(group);
    } else {
        _enableSettingInputs(group);
    }
}

// ---------------------------------------------------------------------------
//  Lock Icon Injection
// ---------------------------------------------------------------------------

/**
 * Inject a lock icon into a setting's form-group.
 */
function _injectLockIcon(group, settingKey, lock, isManager) {
    // Don't double-inject
    if (group.querySelector(".nsl-lock-icon")) return;

    const icon = createLockIcon(settingKey, lock, isManager);

    // Insert the icon at the start of the form-group label
    const label = group.querySelector("label");
    if (label) {
        label.prepend(icon);
    } else {
        group.prepend(icon);
    }
}

/**
 * Apply the lock type the GM picked for a setting.
 */
async function _onPickLock(icon, type) {
    const settingKey = icon.dataset.lockKey;
    const group = icon.closest(".form-group");
    const { changed, localValueChanged } = await changeLockType(settingKey, type);
    if (!changed) return;

    const lock = getLockMap()[settingKey] ?? null;
    updateLockIcon(icon, lock, true);
    if (!group) return;
    _applyGroupLockState(group, lock, true);
    if (localValueChanged) _syncInputValue(group, settingKey);
}

// ---------------------------------------------------------------------------
//  In-place Refresh (after a GM broadcast)
// ---------------------------------------------------------------------------

/**
 * Update lock icons, input disabling and enforced values in every open SettingsConfig
 * without re-rendering it, so unsaved edits to other settings are kept.
 * @param {Set<string>} [changedKeys]  Lock keys whose values were changed on this client
 */
function _refreshOpenSettingsConfigs(changedKeys = new Set()) {
    const SettingsConfig = foundry.applications.settings.SettingsConfig;
    const map = getLockMap();
    const isManager = canManageLocks();

    for (const app of foundry.applications.instances.values()) {
        if (!(app instanceof SettingsConfig) || !app.rendered) continue;
        for (const icon of app.element.querySelectorAll(".nsl-lock-icon[data-lock-key]")) {
            const settingKey = icon.dataset.lockKey;
            const group = icon.closest(".form-group");
            if (!group) continue;
            const lock = map[settingKey] ?? null;
            updateLockIcon(icon, lock, isManager);
            _applyGroupLockState(group, lock, isManager);
            if (changedKeys.has(settingKey)) _syncInputValue(group, settingKey);
        }
    }
}

/**
 * Show a setting's current client value in its form input.
 */
function _syncInputValue(group, settingKey) {
    const input = group.querySelector(`[name="${CSS.escape(settingKey)}"]`);
    if (!input) return;
    const [namespace, ...keyParts] = settingKey.split(".");
    let value;
    try {
        value = game.settings.get(namespace, keyParts.join("."));
    } catch {
        return;
    }
    if (input instanceof HTMLInputElement && input.type === "checkbox") input.checked = !!value;
    else input.value = value ?? "";
}

// ---------------------------------------------------------------------------
//  Input Disabling (hard locks — all users)
//  Uses CSS-only approach: a class on the form-group triggers a ::after
//  overlay that blocks all interaction. No individual input properties are
//  modified, so SettingsConfig form submission is never disrupted.
// ---------------------------------------------------------------------------

/**
 * Block interaction on a hard-locked form-group via CSS overlay.
 */
function _disableSettingInputs(group) {
    group.classList.add("nsl-hard-locked");
}

/**
 * Restore interaction when a hard lock is removed.
 */
function _enableSettingInputs(group) {
    group.classList.remove("nsl-hard-locked");
}

// ---------------------------------------------------------------------------
//  Module Settings Buttons (Export / Import)
// ---------------------------------------------------------------------------

/**
 * Inject Export/Import buttons into our module's own settings section,
 * right after the Lock Manager menu button.
 */
function _injectModuleButtons(app, html) {
    // Don't double-inject
    if (html.querySelector(".nsl-module-buttons")) return;

    // Find our module's settings section.
    // Strategy 1: look for the menu button we registered (data-key="niks-settings-locks.lockManager")
    const menuBtn = html.querySelector(`[data-key="${MODULE_ID}.lockManager"]`);
    const moduleSection = menuBtn?.closest(".form-group") ?? menuBtn?.closest(".settings-list, .category");

    // Strategy 2: fallback — find any element referencing our module ID
    const anchor = moduleSection
        ?? html.querySelector(`[data-category-id="${MODULE_ID}"]`)
        ?? html.querySelector(`[data-tab="${MODULE_ID}"]`);

    if (!anchor) return;

    const container = document.createElement("div");
    container.classList.add("nsl-module-buttons");

    const exportBtn = document.createElement("button");
    exportBtn.type = "button";
    exportBtn.classList.add("nsl-btn", "nsl-export-btn");
    exportBtn.innerHTML = `<i class="fa-solid fa-file-export"></i> ${game.i18n.localize("NSL.Manager.ExportButton")}`;
    exportBtn.addEventListener("click", (e) => {
        e.preventDefault();
        exportLocks();
    });

    const importBtn = document.createElement("button");
    importBtn.type = "button";
    importBtn.classList.add("nsl-btn", "nsl-import-btn");
    importBtn.innerHTML = `<i class="fa-solid fa-file-import"></i> ${game.i18n.localize("NSL.Manager.ImportButton")}`;
    importBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        if (await importLocks()) await applyLocks();
        app.render();
    });

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.classList.add("nsl-btn", "nsl-btn-danger", "nsl-clear-btn");
    clearBtn.innerHTML = `<i class="fa-solid fa-trash"></i> ${game.i18n.localize("NSL.Manager.ClearAllButton")}`;
    clearBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: game.i18n.localize("NSL.Manager.ClearAllButton") },
            content: `<p>${game.i18n.localize("NSL.Manager.ClearAllConfirm")}</p>`,
            defaultYes: false
        });
        if (!confirmed) return;
        await setLockMap({});
        refreshHardLockSet();
        game.socket.emit(SOCKET_CHANNEL, { action: "apply-locks" });
        app.render();
    });

    const reenforceBtn = document.createElement("button");
    reenforceBtn.type = "button";
    reenforceBtn.classList.add("nsl-btn", "nsl-reenforce-btn");
    reenforceBtn.innerHTML = `<i class="fa-solid fa-rotate"></i> ${game.i18n.localize("NSL.Manager.ReenforceButton")}`;
    reenforceBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        const count = await reenforceSoftLocks();
        if (count > 0) {
            game.socket.emit(SOCKET_CHANNEL, { action: "apply-locks" });
            const reenforceKey = count === 1 ? "NSL.Notifications.SoftLocksReenforcedOne" : "NSL.Notifications.SoftLocksReenforcedMany";
            ui.notifications.info(game.i18n.format(reenforceKey, { count }));
        } else {
            ui.notifications.warn(game.i18n.localize("NSL.Notifications.NoSoftLocks"));
        }
    });

    container.appendChild(exportBtn);
    container.appendChild(importBtn);
    container.appendChild(reenforceBtn);
    container.appendChild(clearBtn);

    // Insert after the module section element
    if (moduleSection) {
        moduleSection.after(container);
    } else {
        anchor.appendChild(container);
    }
}
