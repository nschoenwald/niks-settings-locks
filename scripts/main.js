/**
 * Nik's Settings Locks — Main Entry Point
 *
 * Registers world settings, initializes the socket channel,
 * wires up the enforcer and UI hooks.
 */

import {
    MODULE_ID, SETTING_LOCK_MAP, SETTING_MIN_ROLE, SETTING_ALLOW_SETTINGS_MODIFY,
    canManageLocks, registerLockMapQuery
} from "./lock-store.js";
import { initEnforcer, registerSocketListener, applyLocks } from "./enforcer.js";
import { initSettingsUI } from "./settings-ui.js";
import { initControlsUI } from "./controls-ui.js";
import { LockManagerApp } from "./lock-manager.js";
import { checkConflictOnReady } from "./conflict-guard.js";

// ---------------------------------------------------------------------------
//  Initialization
// ---------------------------------------------------------------------------

Hooks.once("init", () => {

    // Register the world setting that stores all lock data.
    // Only users with world-setting permission can write it; other lock managers go through the GM query below.
    game.settings.register(MODULE_ID, SETTING_LOCK_MAP, {
        name: "Lock Map",
        hint: "Internal storage for all settings locks. Do not modify manually.",
        scope: "world",
        config: false,
        type: Object,
        default: {},
        restricted: true
    });

    // Register the minimum role setting
    game.settings.register(MODULE_ID, SETTING_MIN_ROLE, {
        name: game.i18n.localize("NSL.Settings.MinRoleName"),
        hint: game.i18n.localize("NSL.Settings.MinRoleHint"),
        scope: "world",
        config: true,
        type: Number,
        default: CONST.USER_ROLES.GAMEMASTER,
        choices: {
            [CONST.USER_ROLES.GAMEMASTER]: game.i18n.localize("NSL.Settings.RoleGM"),
            [CONST.USER_ROLES.ASSISTANT]: game.i18n.localize("NSL.Settings.RoleAssistant"),
            [CONST.USER_ROLES.TRUSTED]: game.i18n.localize("NSL.Settings.RoleTrusted")
        },
        restricted: true,
        requiresReload: true
    });

    // Also let users with Foundry's "Modify Configuration Settings" permission manage locks (opt-out)
    game.settings.register(MODULE_ID, SETTING_ALLOW_SETTINGS_MODIFY, {
        name: game.i18n.localize("NSL.Settings.AllowSettingsModifyName"),
        hint: game.i18n.localize("NSL.Settings.AllowSettingsModifyHint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
        restricted: true,
        requiresReload: true
    });

    // Lets lock managers without world-setting permission (e.g. Trusted Players) save locks via the active GM
    registerLockMapQuery();

    // Register a menu button to open the Lock Manager.
    // Restricted menus are hidden from users without world-setting permission; "ready" lifts this for lock managers.
    game.settings.registerMenu(MODULE_ID, "lockManager", {
        name: game.i18n.localize("NSL.Settings.OpenManager"),
        hint: game.i18n.localize("NSL.Settings.OpenManagerHint"),
        label: game.i18n.localize("NSL.Settings.OpenManager"),
        icon: "fa-solid fa-lock",
        type: LockManagerApp,
        restricted: true
    });

    // Register libWrapper wrappers (must happen early, before any set() calls)
    initEnforcer();

    console.log(`${MODULE_ID} | Initialized.`);
});

Hooks.once("setup", () => {
    // Initialize the settings UI hooks (renderSettingsConfig)
    initSettingsUI();
    // Initialize the controls UI hooks (renderControlsConfig)
    initControlsUI();
});

Hooks.once("ready", async () => {
    // Show the Lock Manager button to every lock manager, including roles below Assistant GM
    if (canManageLocks()) {
        const menu = game.settings.menus.get(`${MODULE_ID}.lockManager`);
        if (menu) menu.restricted = false;
    }

    // Register socket listener (game.socket is now available)
    registerSocketListener();
    // Apply all locks on this client
    await applyLocks();
    // Check for overlapping module lock settings (Carolingian UI)
    checkConflictOnReady();
});
