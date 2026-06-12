/**
 * Nik's Settings Locks — Settings UI
 *
 * Injects lock toggle icons into the SettingsConfig application
 * for GM users, and shows lock indicators for players.
 */

import {
    MODULE_ID, SOCKET_CHANNEL,
    getLockMap, setLock, removeLock, setLockMap,
    exportLocks, importLocks, reenforceSoftLocks
} from "./lock-store.js";
import { isHardLocked, refreshHardLockSet, applyLocks } from "./enforcer.js";

// ---------------------------------------------------------------------------
//  Public API
// ---------------------------------------------------------------------------

/**
 * Initialize the settings UI hooks.
 */
export function initSettingsUI() {
    Hooks.on("renderSettingsConfig", _onRenderSettingsConfig);
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
    const isGM = game.user.isGM;

    // Collect all lockable setting keys for fallback matching
    const lockableKeys = new Set();
    for (const [key, config] of game.settings.settings.entries()) {
        if (config.scope === "client" || config.scope === "user") {
            lockableKeys.add(key);
        }
    }

    // Strategy 1: form-groups with data-setting-id (common in V14 SettingsConfig)
    const formGroups = html.querySelectorAll(".form-group[data-setting-id]");

    if (formGroups.length > 0) {
        for (const group of formGroups) {
            const settingKey = group.dataset.settingId;
            if (!settingKey || !lockableKeys.has(settingKey)) continue;
            _processFormGroup(group, settingKey, map, isGM);
        }
    } else {
        // Strategy 2: fallback — find inputs/selects whose name matches "namespace.key"
        // and walk up to their .form-group parent
        const inputs = html.querySelectorAll("input[name], select[name], textarea[name]");
        const processed = new Set();

        for (const input of inputs) {
            const name = input.name;
            if (!name || !lockableKeys.has(name) || processed.has(name)) continue;

            const group = input.closest(".form-group");
            if (!group) continue;

            processed.add(name);
            _processFormGroup(group, name, map, isGM);
        }
    }

    // GM-only: add export/import buttons to our module's settings section
    if (isGM) {
        _injectModuleButtons(app, html);
    }
}

/**
 * Process a single form-group: inject lock icon and apply disabling.
 */
function _processFormGroup(group, settingKey, map, isGM) {
    const lock = map[settingKey] ?? null;
    _injectLockIcon(group, settingKey, lock, isGM);

    // Disable hard-locked setting inputs for ALL users (locks apply to every client)
    if (lock?.type === "hard") {
        _disableSettingInputs(group);
    }
}

// ---------------------------------------------------------------------------
//  Lock Icon Injection
// ---------------------------------------------------------------------------

/**
 * Inject a lock icon into a setting's form-group.
 */
function _injectLockIcon(group, settingKey, lock, isGM) {
    // Don't double-inject
    if (group.querySelector(".nsl-lock-icon")) return;

    const icon = document.createElement("a");
    icon.classList.add("nsl-lock-icon");
    icon.dataset.settingKey = settingKey;

    // Set initial state
    _updateLockIcon(icon, lock, isGM);

    if (isGM) {
        // Left click: cycle forward (unlocked → soft → hard → unlocked)
        icon.addEventListener("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            await _cycleLockForward(icon, settingKey, group);
        });

        // Right click: cycle backward (unlocked → hard → soft → unlocked)
        icon.addEventListener("contextmenu", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            await _cycleLockBackward(icon, settingKey, group);
        });
    }

    // Insert the icon at the start of the form-group label
    const label = group.querySelector("label");
    if (label) {
        label.prepend(icon);
    } else {
        group.prepend(icon);
    }
}

/**
 * Update the lock icon appearance based on the lock state.
 */
function _updateLockIcon(icon, lock, isGM) {
    icon.classList.remove("nsl-unlocked", "nsl-soft", "nsl-hard");
    icon.innerHTML = "";

    const i = document.createElement("i");

    if (!lock) {
        // Unlocked
        icon.classList.add("nsl-unlocked");
        i.className = "fa-solid fa-lock-open";
        icon.title = isGM
            ? game.i18n.localize("NSL.Tooltip.Unlocked")
            : "";
        // Hide the icon entirely for non-GM when unlocked
        if (!isGM) icon.style.display = "none";
    } else if (lock.type === "soft") {
        icon.classList.add("nsl-soft");
        i.className = "fa-solid fa-lock";
        icon.title = isGM
            ? game.i18n.localize("NSL.Tooltip.Soft")
            : game.i18n.localize("NSL.Tooltip.SoftLockedByGM");
        icon.style.display = "";
    } else if (lock.type === "hard") {
        icon.classList.add("nsl-hard");
        i.className = "fa-solid fa-lock";
        icon.title = isGM
            ? game.i18n.localize("NSL.Tooltip.Hard")
            : game.i18n.localize("NSL.Tooltip.LockedByGM");
        icon.style.display = "";
    }

    icon.appendChild(i);
}

/**
 * Cycle the lock state forward: unlocked → soft → hard → unlocked.
 */
async function _cycleLockForward(icon, settingKey, group) {
    const lock = getLockMap()[settingKey] ?? null;
    const [namespace, ...keyParts] = settingKey.split(".");
    const key = keyParts.join(".");

    if (!lock) {
        // unlocked → soft
        const value = game.settings.get(namespace, key);
        await setLock(settingKey, "soft", value);
        _updateLockIcon(icon, { type: "soft" }, true);
    } else if (lock.type === "soft") {
        // soft → hard
        const value = game.settings.get(namespace, key);
        await setLock(settingKey, "hard", value);
        _updateLockIcon(icon, { type: "hard" }, true);
        _disableSettingInputs(group);
    } else {
        // hard → unlocked
        await removeLock(settingKey);
        _updateLockIcon(icon, null, true);
        _enableSettingInputs(group);
    }

    // Broadcast to all clients
    refreshHardLockSet();
    game.socket.emit(SOCKET_CHANNEL, { action: "apply-locks" });
}

/**
 * Cycle the lock state backward: unlocked → hard → soft → unlocked.
 */
async function _cycleLockBackward(icon, settingKey, group) {
    const lock = getLockMap()[settingKey] ?? null;
    const [namespace, ...keyParts] = settingKey.split(".");
    const key = keyParts.join(".");

    if (!lock) {
        // unlocked → hard
        const value = game.settings.get(namespace, key);
        await setLock(settingKey, "hard", value);
        _updateLockIcon(icon, { type: "hard" }, true);
        _disableSettingInputs(group);
    } else if (lock.type === "hard") {
        // hard → soft
        const value = game.settings.get(namespace, key);
        await setLock(settingKey, "soft", value);
        _updateLockIcon(icon, { type: "soft" }, true);
        _enableSettingInputs(group);
    } else {
        // soft → unlocked
        await removeLock(settingKey);
        _updateLockIcon(icon, null, true);
    }

    refreshHardLockSet();
    game.socket.emit(SOCKET_CHANNEL, { action: "apply-locks" });
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
        await importLocks();
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
            ui.notifications.info(game.i18n.format("NSL.Notifications.SoftLocksReenforced", { count }));
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
