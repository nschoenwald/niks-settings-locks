/**
 * Nik's Settings Locks — Main Entry Point
 *
 * Registers world settings, initializes the socket channel,
 * wires up the enforcer and UI hooks.
 */

import { MODULE_ID, SETTING_LOCK_MAP } from "./lock-store.js";
import { initEnforcer, registerSocketListener, applyLocks } from "./enforcer.js";
import { initSettingsUI } from "./settings-ui.js";
import { initControlsUI } from "./controls-ui.js";
import { LockManagerApp } from "./lock-manager.js";

// ---------------------------------------------------------------------------
//  Initialization
// ---------------------------------------------------------------------------

Hooks.once("init", () => {

    // Register the world setting that stores all lock data.
    // Only GM can write to it (restricted: true), but all clients can read it.
    game.settings.register(MODULE_ID, SETTING_LOCK_MAP, {
        name: "Lock Map",
        hint: "Internal storage for all settings locks. Do not modify manually.",
        scope: "world",
        config: false,
        type: Object,
        default: {},
        restricted: true
    });

    // Register a menu button to open the Lock Manager (GM only)
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
    // Register socket listener (game.socket is now available)
    registerSocketListener();
    // Apply all locks on this client
    await applyLocks();
});
