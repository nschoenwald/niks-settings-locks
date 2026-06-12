/**
 * Nik's Settings Locks — Lock Manager
 *
 * A dedicated ApplicationV2 window for managing all settings locks.
 * Provides a filterable list of all lockable settings with their current
 * lock state, type-appropriate value editors, and bulk operations.
 */

import {
    MODULE_ID, SOCKET_CHANNEL,
    getLockMap, setLock, removeLock, setLockMap,
    exportLocks, importLocks
} from "./lock-store.js";
import { refreshHardLockSet } from "./enforcer.js";

// ---------------------------------------------------------------------------
//  Lock Manager Application
// ---------------------------------------------------------------------------

export class LockManagerApp extends foundry.applications.api.ApplicationV2 {

    static DEFAULT_OPTIONS = {
        id: "nsl-lock-manager",
        classes: ["nsl-lock-manager"],
        tag: "div",
        window: {
            title: "NSL.Manager.Title",
            icon: "fa-solid fa-lock",
            resizable: true
        },
        position: {
            width: 780,
            height: 640
        }
    };

    /** @override */
    async _prepareContext() {
        const map = getLockMap();
        const settings = [];

        for (const [key, config] of game.settings.settings.entries()) {
            // Only show client/user scoped settings
            if (config.scope !== "client" && config.scope !== "user") continue;

            // Skip hidden settings (config: false)
            if (config.config === false) continue;

            const [namespace] = key.split(".");
            const lock = map[key] ?? null;

            // Get current value
            let currentValue;
            try {
                const parts = key.split(".");
                currentValue = game.settings.get(parts[0], parts.slice(1).join("."));
            } catch {
                currentValue = undefined;
            }

            // Determine module/system title
            let moduleTitle = namespace;
            if (namespace === "core") {
                moduleTitle = "Core";
            } else {
                const mod = game.modules.get(namespace);
                if (mod) moduleTitle = mod.title;
                else if (namespace === game.system.id) moduleTitle = game.system.title;
            }

            // Determine the effective value (locked value if locked, else current)
            const effectiveValue = lock ? lock.value : currentValue;

            // Build setting metadata for input rendering
            const settingMeta = {
                type: _resolveType(config.type),
                choices: config.choices ?? null,
                range: config.range ?? null,
                filePicker: config.filePicker ?? false,
                isColor: config.type === foundry.data.fields.ColorField
                    || (typeof config.type === "function" && config.type.name === "Color")
                    || _looksLikeColor(effectiveValue)
            };

            settings.push({
                key,
                namespace,
                moduleTitle,
                name: config.name ? game.i18n.localize(config.name) : key,
                hint: config.hint ? game.i18n.localize(config.hint) : "",
                scope: config.scope,
                lockType: lock?.type ?? "none",
                effectiveValue,
                currentValue,
                meta: settingMeta,
                requiresReload: !!config.requiresReload
            });
        }

        // Sort by module title, then setting name
        settings.sort((a, b) => {
            const modCmp = a.moduleTitle.localeCompare(b.moduleTitle);
            if (modCmp !== 0) return modCmp;
            return a.name.localeCompare(b.name);
        });

        return { settings, map };
    }

    /** @override */
    async _renderHTML(context) {
        const { settings } = context;
        const container = document.createElement("div");
        container.classList.add("nsl-manager-content");

        // --- Toolbar ---
        const toolbar = document.createElement("div");
        toolbar.classList.add("nsl-manager-toolbar");

        const filterInput = document.createElement("input");
        filterInput.type = "search";
        filterInput.placeholder = game.i18n.localize("NSL.Manager.FilterPlaceholder");
        filterInput.classList.add("nsl-filter-input");
        filterInput.addEventListener("input", () => this._applyFilter(container, filterInput.value));

        const showLockedCheckbox = document.createElement("label");
        showLockedCheckbox.classList.add("nsl-show-locked-toggle");
        showLockedCheckbox.innerHTML = `<input type="checkbox" class="nsl-show-locked-checkbox"> ${game.i18n.localize("NSL.Manager.ShowLockedOnly")}`;
        showLockedCheckbox.querySelector("input").addEventListener("change", (e) => {
            this._applyFilter(container, filterInput.value, e.target.checked);
        });

        toolbar.append(filterInput, showLockedCheckbox);

        // --- Button bar ---
        const btnBar = document.createElement("div");
        btnBar.classList.add("nsl-manager-buttons");

        const exportBtn = document.createElement("button");
        exportBtn.type = "button";
        exportBtn.classList.add("nsl-btn");
        exportBtn.innerHTML = `<i class="fa-solid fa-file-export"></i> ${game.i18n.localize("NSL.Manager.ExportButton")}`;
        exportBtn.addEventListener("click", () => exportLocks());

        const importBtn = document.createElement("button");
        importBtn.type = "button";
        importBtn.classList.add("nsl-btn");
        importBtn.innerHTML = `<i class="fa-solid fa-file-import"></i> ${game.i18n.localize("NSL.Manager.ImportButton")}`;
        importBtn.addEventListener("click", async () => {
            await importLocks();
            this.render();
        });

        const clearBtn = document.createElement("button");
        clearBtn.type = "button";
        clearBtn.classList.add("nsl-btn", "nsl-btn-danger");
        clearBtn.innerHTML = `<i class="fa-solid fa-trash"></i> ${game.i18n.localize("NSL.Manager.ClearAllButton")}`;
        clearBtn.addEventListener("click", async () => {
            const confirmed = await foundry.applications.api.DialogV2.confirm({
                window: { title: game.i18n.localize("NSL.Manager.ClearAllButton") },
                content: `<p>${game.i18n.localize("NSL.Manager.ClearAllConfirm")}</p>`,
                defaultYes: false
            });
            if (!confirmed) return;
            await setLockMap({});
            refreshHardLockSet();
            game.socket.emit(SOCKET_CHANNEL, { action: "apply-locks" });
            this.render();
        });

        btnBar.append(exportBtn, importBtn, clearBtn);
        toolbar.append(btnBar);

        container.appendChild(toolbar);

        // --- Settings Table ---
        const table = document.createElement("table");
        table.classList.add("nsl-manager-table");

        // Header
        const thead = document.createElement("thead");
        thead.innerHTML = `<tr>
            <th class="nsl-col-lock">${game.i18n.localize("NSL.Manager.ColumnLock")}</th>
            <th class="nsl-col-setting">${game.i18n.localize("NSL.Manager.ColumnSetting")}</th>
            <th class="nsl-col-module">${game.i18n.localize("NSL.Manager.ColumnModule")}</th>
            <th class="nsl-col-value">${game.i18n.localize("NSL.Manager.ColumnValue")}</th>
        </tr>`;
        table.appendChild(thead);

        // Body
        const tbody = document.createElement("tbody");
        for (const setting of settings) {
            const row = this._buildSettingRow(setting);
            tbody.appendChild(row);
        }
        table.appendChild(tbody);

        const tableWrapper = document.createElement("div");
        tableWrapper.classList.add("nsl-table-wrapper");
        tableWrapper.appendChild(table);
        container.appendChild(tableWrapper);

        return container;
    }

    /** @override */
    _replaceHTML(result, content) {
        content.replaceChildren(result);
    }

    // -----------------------------------------------------------------------
    //  Row Builder
    // -----------------------------------------------------------------------

    /**
     * Build a single table row for a setting.
     */
    _buildSettingRow(setting) {
        const row = document.createElement("tr");
        row.classList.add("nsl-manager-row");
        row.dataset.settingKey = setting.key;
        row.dataset.lockType = setting.lockType;
        row.dataset.searchText = `${setting.name} ${setting.moduleTitle} ${setting.key}`.toLowerCase();

        // --- Lock control cell ---
        const lockCell = document.createElement("td");
        lockCell.classList.add("nsl-col-lock");
        const lockBtn = document.createElement("a");
        lockBtn.classList.add("nsl-lock-control", `nsl-${setting.lockType}`);
        lockBtn.dataset.settingKey = setting.key;

        const lockIcon = document.createElement("i");
        if (setting.lockType === "none") {
            lockIcon.className = "fa-solid fa-lock-open";
            lockBtn.title = game.i18n.localize("NSL.LockType.None");
        } else if (setting.lockType === "soft") {
            lockIcon.className = "fa-solid fa-lock";
            lockBtn.title = game.i18n.localize("NSL.LockType.Soft");
        } else {
            lockIcon.className = "fa-solid fa-lock";
            lockBtn.title = game.i18n.localize("NSL.LockType.Hard");
        }
        lockBtn.appendChild(lockIcon);

        lockBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            await this._cycleLock(setting.key, "forward");
        });
        lockBtn.addEventListener("contextmenu", async (e) => {
            e.preventDefault();
            await this._cycleLock(setting.key, "backward");
        });

        lockCell.appendChild(lockBtn);
        row.appendChild(lockCell);

        // --- Setting name cell ---
        const nameCell = document.createElement("td");
        nameCell.classList.add("nsl-col-setting");
        nameCell.innerHTML = `<span class="nsl-setting-name">${setting.name}</span>`;
        if (setting.hint) {
            nameCell.innerHTML += `<span class="nsl-setting-hint">${setting.hint}</span>`;
        }
        row.appendChild(nameCell);

        // --- Module cell ---
        const modCell = document.createElement("td");
        modCell.classList.add("nsl-col-module");
        modCell.textContent = setting.moduleTitle;
        row.appendChild(modCell);

        // --- Value cell (with proper input control) ---
        const valCell = document.createElement("td");
        valCell.classList.add("nsl-col-value");

        const isLocked = setting.lockType !== "none";
        const inputEl = this._buildValueInput(setting, isLocked);
        valCell.appendChild(inputEl);
        row.appendChild(valCell);

        return row;
    }

    // -----------------------------------------------------------------------
    //  Value Input Builder
    // -----------------------------------------------------------------------

    /**
     * Build the appropriate input control for a setting based on its metadata.
     */
    _buildValueInput(setting, isLocked) {
        const { meta, effectiveValue, key } = setting;
        const wrapper = document.createElement("div");
        wrapper.classList.add("nsl-value-control");

        let input;

        // --- Choices dropdown ---
        if (meta.choices) {
            input = document.createElement("select");
            input.classList.add("nsl-value-input");

            // Localize choice labels if they look like i18n keys
            for (const [optValue, optLabel] of Object.entries(meta.choices)) {
                const option = document.createElement("option");
                option.value = optValue;
                option.textContent = game.i18n.localize(optLabel);
                if (String(effectiveValue) === String(optValue)) option.selected = true;
                input.appendChild(option);
            }

            input.addEventListener("change", () => this._onValueChange(key, input.value));
        }

        // --- Boolean checkbox ---
        else if (meta.type === "Boolean") {
            input = document.createElement("input");
            input.type = "checkbox";
            input.classList.add("nsl-value-input", "nsl-value-checkbox");
            input.checked = !!effectiveValue;

            input.addEventListener("change", () => this._onValueChange(key, input.checked));
        }

        // --- Number with range ---
        else if (meta.type === "Number" && meta.range) {
            const rangeWrapper = document.createElement("div");
            rangeWrapper.classList.add("nsl-range-wrapper");

            const rangeInput = document.createElement("input");
            rangeInput.type = "range";
            rangeInput.classList.add("nsl-value-input", "nsl-value-range");
            rangeInput.min = meta.range.min ?? 0;
            rangeInput.max = meta.range.max ?? 100;
            rangeInput.step = meta.range.step ?? 1;
            rangeInput.value = effectiveValue ?? 0;

            const numberDisplay = document.createElement("span");
            numberDisplay.classList.add("nsl-range-value");
            numberDisplay.textContent = effectiveValue ?? 0;

            rangeInput.addEventListener("input", () => {
                numberDisplay.textContent = rangeInput.value;
            });
            rangeInput.addEventListener("change", () => {
                this._onValueChange(key, Number(rangeInput.value));
            });

            rangeWrapper.append(rangeInput, numberDisplay);
            input = rangeWrapper;
        }

        // --- Number (plain) ---
        else if (meta.type === "Number") {
            input = document.createElement("input");
            input.type = "number";
            input.classList.add("nsl-value-input");
            input.value = effectiveValue ?? 0;

            input.addEventListener("change", () => this._onValueChange(key, Number(input.value)));
        }

        // --- Color ---
        else if (meta.isColor) {
            input = document.createElement("input");
            input.type = "color";
            input.classList.add("nsl-value-input", "nsl-value-color");
            input.value = effectiveValue || "#000000";

            input.addEventListener("change", () => this._onValueChange(key, input.value));
        }

        // --- String (default) ---
        else {
            input = document.createElement("input");
            input.type = "text";
            input.classList.add("nsl-value-input");
            input.value = effectiveValue ?? "";

            input.addEventListener("change", () => this._onValueChange(key, input.value));
        }

        // Disable input when setting is not locked (show as read-only preview)
        if (!isLocked) {
            _setReadOnly(input, true);
        }

        wrapper.appendChild(input);
        return wrapper;
    }

    // -----------------------------------------------------------------------
    //  Value Change Handler
    // -----------------------------------------------------------------------

    /**
     * Handle value changes from the input controls.
     * Updates the locked value immediately.
     */
    async _onValueChange(settingKey, newValue) {
        const map = getLockMap();
        const lock = map[settingKey];
        if (!lock) return; // Only update locked settings

        await setLock(settingKey, lock.type, newValue);
        refreshHardLockSet();
        game.socket.emit(SOCKET_CHANNEL, { action: "apply-locks" });
    }

    // -----------------------------------------------------------------------
    //  Filtering
    // -----------------------------------------------------------------------

    _applyFilter(container, filterText, lockedOnly = false) {
        const text = (filterText || "").toLowerCase().trim();
        const checkbox = container.querySelector(".nsl-show-locked-checkbox");
        if (checkbox && lockedOnly === undefined) lockedOnly = checkbox.checked;

        const rows = container.querySelectorAll(".nsl-manager-row");
        for (const row of rows) {
            const searchText = row.dataset.searchText || "";
            const lockType = row.dataset.lockType || "none";

            let visible = true;
            if (text && !searchText.includes(text)) visible = false;
            if (lockedOnly && lockType === "none") visible = false;

            row.style.display = visible ? "" : "none";
        }
    }

    // -----------------------------------------------------------------------
    //  Lock Cycling
    // -----------------------------------------------------------------------

    async _cycleLock(settingKey, direction) {
        const map = getLockMap();
        const lock = map[settingKey] ?? null;
        const [namespace, ...keyParts] = settingKey.split(".");
        const key = keyParts.join(".");
        const value = game.settings.get(namespace, key);

        if (direction === "forward") {
            if (!lock) {
                await setLock(settingKey, "soft", value);
            } else if (lock.type === "soft") {
                await setLock(settingKey, "hard", value);
            } else {
                await removeLock(settingKey);
            }
        } else {
            if (!lock) {
                await setLock(settingKey, "hard", value);
            } else if (lock.type === "hard") {
                await setLock(settingKey, "soft", value);
            } else {
                await removeLock(settingKey);
            }
        }

        refreshHardLockSet();
        game.socket.emit(SOCKET_CHANNEL, { action: "apply-locks" });
        this.render();
    }
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a Foundry setting type to a simple string.
 */
function _resolveType(type) {
    if (!type) return "String";
    if (type === Boolean || type?.name === "Boolean") return "Boolean";
    if (type === Number || type?.name === "Number") return "Number";
    if (type === String || type?.name === "String") return "String";
    if (type === Object || type?.name === "Object") return "Object";
    if (type === Array || type?.name === "Array") return "Array";
    return "String";
}

/**
 * Check if a value looks like a CSS color string.
 */
function _looksLikeColor(value) {
    if (typeof value !== "string") return false;
    return /^#[0-9a-fA-F]{6,8}$/.test(value);
}

/**
 * Set an input element (or wrapper containing inputs) to read-only.
 */
function _setReadOnly(el, readOnly) {
    if (!el) return;

    // If the element is a wrapper, find all inputs inside
    const inputs = el.querySelectorAll ? el.querySelectorAll("input, select, textarea") : [];
    const targets = inputs.length > 0 ? inputs : [el];

    for (const target of targets) {
        if (readOnly) {
            target.classList.add("nsl-readonly");
            if (target.tagName === "SELECT") {
                target.disabled = true;
            } else if (target.type === "checkbox") {
                target.disabled = true;
            } else {
                target.readOnly = true;
            }
        } else {
            target.classList.remove("nsl-readonly");
            target.disabled = false;
            target.readOnly = false;
        }
    }
}
