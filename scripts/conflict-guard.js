/**
 * Nik's Settings Locks — Conflict Guard
 *
 * Detects overlapping lock mechanisms from other modules (specifically
 * Carolingian UI's "Enable client settings lock for core and other modules")
 * and provides UI suppression and one-click resolution for the GM.
 */

import { canManageLocks } from "./lock-store.js";

export const CRLNGN_MODULE_ID = "crlngn-ui";
export const CRLNGN_LOCK_OTHER_SETTING = "v2-lock-other-modules";

/**
 * Check whether Carolingian UI is active in this world.
 * @returns {boolean}
 */
export function isCarolingianActive() {
    return !!game.modules?.get(CRLNGN_MODULE_ID)?.active;
}

/**
 * Check whether Carolingian UI's generic settings lock option is enabled.
 * @returns {boolean}
 */
export function isCarolingianGenericLockEnabled() {
    if (!isCarolingianActive()) return false;
    try {
        return game.settings.get(CRLNGN_MODULE_ID, CRLNGN_LOCK_OTHER_SETTING) === true;
    } catch {
        return false;
    }
}

/**
 * Programmatically disable Carolingian UI's generic settings lock.
 * Only callable by GMs / managers.
 * @returns {Promise<boolean>}
 */
export async function disableCarolingianGenericLock() {
    if (!isCarolingianActive()) return false;
    try {
        await game.settings.set(CRLNGN_MODULE_ID, CRLNGN_LOCK_OTHER_SETTING, false);
        return true;
    } catch (err) {
        console.error("niks-settings-locks | Failed to disable Carolingian UI generic lock:", err);
        return false;
    }
}

/**
 * Render a conflict warning banner if Carolingian UI's generic lock is enabled.
 * @param {HTMLElement} parentElement - Container where the banner should be inserted
 * @param {Function} [onResolved] - Callback after the conflict is resolved
 * @returns {HTMLElement|null} The created banner element or null
 */
export function renderConflictBanner(parentElement, onResolved) {
    if (!parentElement || !canManageLocks() || !isCarolingianGenericLockEnabled()) {
        return null;
    }

    // Avoid double banners
    const existing = parentElement.querySelector(".nsl-conflict-banner");
    if (existing) return existing;

    const banner = document.createElement("div");
    banner.classList.add("nsl-conflict-banner");

    const icon = document.createElement("i");
    icon.className = "fa-solid fa-triangle-exclamation";

    const textWrapper = document.createElement("div");
    textWrapper.classList.add("nsl-conflict-text");

    const title = document.createElement("strong");
    title.textContent = game.i18n.localize("NSL.Conflict.BannerTitle");

    const desc = document.createElement("p");
    desc.textContent = game.i18n.localize("NSL.Conflict.BannerText");

    textWrapper.append(title, desc);

    const fixBtn = document.createElement("button");
    fixBtn.type = "button";
    fixBtn.classList.add("nsl-btn-conflict-fix");
    fixBtn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> ${game.i18n.localize("NSL.Conflict.BannerButton")}`;

    fixBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        fixBtn.disabled = true;

        const success = await disableCarolingianGenericLock();
        if (success) {
            ui.notifications.info(game.i18n.localize("NSL.Conflict.ResolvedNotification"));
            banner.remove();
            if (typeof onResolved === "function") onResolved();

            // Prompt GM to reload so Carolingian UI wrappers are cleanly removed from memory
            try {
                if (typeof foundry.applications?.settings?.SettingsConfig?.reloadConfirm === "function") {
                    foundry.applications.settings.SettingsConfig.reloadConfirm({ world: true });
                }
            } catch {
                // Ignore if reloadConfirm dialog cannot be shown
            }
        } else {
            fixBtn.disabled = false;
        }
    });

    banner.append(icon, textWrapper, fixBtn);

    // Insert at top of container
    parentElement.prepend(banner);
    return banner;
}

/**
 * Check for conflicts on ready and warn the GM if needed.
 */
export function checkConflictOnReady() {
    if (!canManageLocks()) return;
    if (isCarolingianGenericLockEnabled()) {
        console.warn("niks-settings-locks | Carolingian UI generic settings lock is enabled. This may cause duplicate icons and desync.");
        ui.notifications.warn(game.i18n.localize("NSL.Conflict.ReadyWarn"), { permanent: false });
    }
}
