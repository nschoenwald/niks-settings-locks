/**
 * Nik's Settings Locks — Lock Manager
 *
 * A dedicated ApplicationV2 window for managing all settings and keybinding locks.
 * Provides a filterable list of all lockable items with their current
 * lock state, type-appropriate value editors, and bulk operations.
 */

import {
    MODULE_ID, SOCKET_CHANNEL, KB_PREFIX,
    getLockMap, setLock, removeLock, setLockMap,
    exportLocks, importLocks, reenforceSoftLocks
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

    /** Guard against rapid double-clicks on lock cycling. */
    _lockCycleInProgress = false;

    /** @override */
    async _prepareContext() {
        const map = getLockMap();
        const items = [];

        // --- Gather Settings ---
        for (const [key, config] of game.settings.settings.entries()) {
            if (config.scope !== "client" && config.scope !== "user") continue;
            if (config.config === false) continue;

            const [namespace] = key.split(".");
            const lock = map[key] ?? null;

            let currentValue;
            try {
                const parts = key.split(".");
                currentValue = game.settings.get(parts[0], parts.slice(1).join("."));
            } catch {
                currentValue = undefined;
            }

            let moduleTitle = namespace;
            if (namespace === "core") {
                moduleTitle = "Core";
            } else {
                const mod = game.modules.get(namespace);
                if (mod) moduleTitle = mod.title;
                else if (namespace === game.system.id) moduleTitle = game.system.title;
            }

            const effectiveValue = lock ? lock.value : currentValue;

            const settingMeta = {
                type: _resolveType(config.type),
                choices: config.choices ?? null,
                range: config.range ?? null,
                filePicker: config.filePicker ?? false,
                isColor: _isColorType(config.type, effectiveValue)
            };

            items.push({
                key,
                lockKey: key,
                itemType: "setting",
                namespace,
                moduleTitle,
                name: config.name ? game.i18n.localize(config.name) : key,
                hint: config.hint ? game.i18n.localize(config.hint) : "",
                lockType: lock?.type ?? "none",
                effectiveValue,
                currentValue,
                meta: settingMeta,
                requiresReload: !!config.requiresReload
            });
        }

        // --- Gather Keybindings ---
        for (const [actionKey, actionConfig] of game.keybindings.actions.entries()) {
            // Skip uneditable-only keybindings
            if (actionConfig.editable?.length === 0 && actionConfig.uneditable?.length > 0) continue;

            const lockKey = `${KB_PREFIX}${actionKey}`;
            const lock = map[lockKey] ?? null;

            const [namespace] = actionKey.split(".");

            let moduleTitle = namespace;
            if (namespace === "core") {
                moduleTitle = "Core";
            } else {
                const mod = game.modules.get(namespace);
                if (mod) moduleTitle = mod.title;
                else if (namespace === game.system.id) moduleTitle = game.system.title;
            }

            // Get current bindings
            let currentValue;
            try {
                const parts = actionKey.split(".");
                currentValue = game.keybindings.get(parts[0], parts.slice(1).join("."));
            } catch {
                currentValue = [];
            }

            const effectiveValue = lock ? lock.value : currentValue;

            items.push({
                key: actionKey,
                lockKey,
                itemType: "keybinding",
                namespace,
                moduleTitle,
                name: actionConfig.name ? game.i18n.localize(actionConfig.name) : actionKey,
                hint: actionConfig.hint ? game.i18n.localize(actionConfig.hint) : "",
                lockType: lock?.type ?? "none",
                effectiveValue,
                currentValue,
                meta: { type: "Keybinding" },
                requiresReload: false
            });
        }

        // Sort by module title, then item name
        items.sort((a, b) => {
            const modCmp = a.moduleTitle.localeCompare(b.moduleTitle);
            if (modCmp !== 0) return modCmp;
            return a.name.localeCompare(b.name);
        });

        // --- Find Orphaned Locks ---
        // Locks whose setting/keybinding no longer exists (module uninstalled, etc.)
        const knownLockKeys = new Set(items.map(i => i.lockKey));
        const orphaned = [];
        for (const [lockKey, lock] of Object.entries(map)) {
            if (knownLockKeys.has(lockKey)) continue;

            const isKeybinding = lockKey.startsWith(KB_PREFIX);
            const rawKey = isKeybinding ? lockKey.slice(KB_PREFIX.length) : lockKey;
            const [namespace] = rawKey.split(".");

            orphaned.push({
                lockKey,
                key: rawKey,
                itemType: isKeybinding ? "keybinding" : "setting",
                namespace,
                lockType: lock.type,
                effectiveValue: lock.value
            });
        }

        orphaned.sort((a, b) => a.key.localeCompare(b.key));

        return { items, orphaned, map };
    }

    /** @override */
    async _renderHTML(context) {
        const { items, orphaned } = context;
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

        const reenforceBtn = document.createElement("button");
        reenforceBtn.type = "button";
        reenforceBtn.classList.add("nsl-btn");
        reenforceBtn.innerHTML = `<i class="fa-solid fa-rotate"></i> ${game.i18n.localize("NSL.Manager.ReenforceButton")}`;
        reenforceBtn.addEventListener("click", async () => {
            const count = await reenforceSoftLocks();
            if (count > 0) {
                game.socket.emit(SOCKET_CHANNEL, { action: "apply-locks" });
                const reenforceKey = count === 1 ? "NSL.Notifications.SoftLocksReenforcedOne" : "NSL.Notifications.SoftLocksReenforcedMany";
                ui.notifications.info(game.i18n.format(reenforceKey, { count }));
            } else {
                ui.notifications.warn(game.i18n.localize("NSL.Notifications.NoSoftLocks"));
            }
        });

        btnBar.append(exportBtn, importBtn, reenforceBtn, clearBtn);
        toolbar.append(btnBar);

        container.appendChild(toolbar);

        // --- Items Table ---
        const table = document.createElement("table");
        table.classList.add("nsl-manager-table");

        // Header
        const thead = document.createElement("thead");
        thead.innerHTML = `<tr>
            <th class="nsl-col-lock">${game.i18n.localize("NSL.Manager.ColumnLock")}</th>
            <th class="nsl-col-type">${game.i18n.localize("NSL.Manager.ColumnType")}</th>
            <th class="nsl-col-setting">${game.i18n.localize("NSL.Manager.ColumnName")}</th>
            <th class="nsl-col-module">${game.i18n.localize("NSL.Manager.ColumnModule")}</th>
            <th class="nsl-col-value">${game.i18n.localize("NSL.Manager.ColumnValue")}</th>
        </tr>`;
        table.appendChild(thead);

        // Body
        const tbody = document.createElement("tbody");
        if (items.length === 0) {
            const emptyRow = document.createElement("tr");
            emptyRow.classList.add("nsl-empty-row");
            const emptyCell = document.createElement("td");
            emptyCell.colSpan = 5;
            emptyCell.textContent = game.i18n.localize("NSL.Manager.NoResults");
            emptyRow.appendChild(emptyCell);
            tbody.appendChild(emptyRow);
        } else {
            for (const item of items) {
                const row = this._buildRow(item);
                tbody.appendChild(row);
            }
        }
        table.appendChild(tbody);

        const tableWrapper = document.createElement("div");
        tableWrapper.classList.add("nsl-table-wrapper");
        tableWrapper.appendChild(table);
        container.appendChild(tableWrapper);

        // --- Orphaned Locks Section ---
        if (orphaned.length > 0) {
            const orphanSection = document.createElement("div");
            orphanSection.classList.add("nsl-orphaned-section");

            const orphanHeader = document.createElement("div");
            orphanHeader.classList.add("nsl-orphaned-header");

            const orphanTitle = document.createElement("h3");
            orphanTitle.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${game.i18n.localize("NSL.Manager.OrphanedTitle")}`;
            orphanHeader.appendChild(orphanTitle);

            const orphanHint = document.createElement("p");
            orphanHint.classList.add("nsl-orphaned-hint");
            orphanHint.textContent = game.i18n.localize("NSL.Manager.OrphanedHint");
            orphanHeader.appendChild(orphanHint);

            const removeAllBtn = document.createElement("button");
            removeAllBtn.type = "button";
            removeAllBtn.classList.add("nsl-btn", "nsl-btn-danger", "nsl-orphaned-remove-all");
            removeAllBtn.innerHTML = `<i class="fa-solid fa-trash"></i> ${game.i18n.localize("NSL.Manager.OrphanedRemoveAll")}`;
            removeAllBtn.addEventListener("click", async () => {
                const map = getLockMap();
                for (const o of orphaned) {
                    delete map[o.lockKey];
                }
                await setLockMap(map);
                refreshHardLockSet();
                game.socket.emit(SOCKET_CHANNEL, { action: "apply-locks" });
                this.render();
            });
            orphanHeader.appendChild(removeAllBtn);

            orphanSection.appendChild(orphanHeader);

            const orphanTable = document.createElement("table");
            orphanTable.classList.add("nsl-manager-table", "nsl-orphaned-table");

            const orphanThead = document.createElement("thead");
            orphanThead.innerHTML = `<tr>
                <th class="nsl-col-type">${game.i18n.localize("NSL.Manager.ColumnType")}</th>
                <th class="nsl-col-setting">${game.i18n.localize("NSL.Manager.OrphanedColumnKey")}</th>
                <th class="nsl-col-lock">${game.i18n.localize("NSL.Manager.ColumnLock")}</th>
                <th class="nsl-col-orphan-action"></th>
            </tr>`;
            orphanTable.appendChild(orphanThead);

            const orphanTbody = document.createElement("tbody");
            for (const o of orphaned) {
                const row = document.createElement("tr");
                row.classList.add("nsl-manager-row", "nsl-orphaned-row");

                // Type
                const typeCell = document.createElement("td");
                typeCell.classList.add("nsl-col-type");
                const typeBadge = document.createElement("span");
                typeBadge.classList.add("nsl-type-badge", `nsl-type-${o.itemType}`);
                typeBadge.innerHTML = o.itemType === "keybinding"
                    ? `<i class="fa-solid fa-keyboard"></i>`
                    : `<i class="fa-solid fa-gear"></i>`;
                typeCell.appendChild(typeBadge);
                row.appendChild(typeCell);

                // Key (safe: use textContent, not innerHTML)
                const keyCell = document.createElement("td");
                keyCell.classList.add("nsl-col-setting");
                const keyName = document.createElement("span");
                keyName.classList.add("nsl-setting-name", "nsl-orphaned-key");
                const keyCode = document.createElement("code");
                keyCode.textContent = o.key;
                keyName.appendChild(keyCode);
                keyCell.appendChild(keyName);
                const keyHint = document.createElement("span");
                keyHint.classList.add("nsl-setting-hint");
                keyHint.textContent = o.namespace;
                keyCell.appendChild(keyHint);
                row.appendChild(keyCell);

                // Lock type
                const lockCell = document.createElement("td");
                lockCell.classList.add("nsl-col-lock");
                const lockBadge = document.createElement("span");
                lockBadge.classList.add("nsl-lock-control", `nsl-${o.lockType}`);
                const lockIcon = document.createElement("i");
                lockIcon.className = "fa-solid fa-lock";
                lockBadge.appendChild(lockIcon);
                lockCell.appendChild(lockBadge);
                row.appendChild(lockCell);

                // Delete button
                const actionCell = document.createElement("td");
                actionCell.classList.add("nsl-col-orphan-action");
                const deleteBtn = document.createElement("button");
                deleteBtn.type = "button";
                deleteBtn.classList.add("nsl-btn", "nsl-btn-danger", "nsl-orphan-delete");
                deleteBtn.innerHTML = `<i class="fa-solid fa-xmark"></i>`;
                deleteBtn.title = game.i18n.localize("NSL.Manager.OrphanedRemove");
                deleteBtn.addEventListener("click", async () => {
                    await removeLock(o.lockKey);
                    refreshHardLockSet();
                    game.socket.emit(SOCKET_CHANNEL, { action: "apply-locks" });
                    this.render();
                });
                actionCell.appendChild(deleteBtn);
                row.appendChild(actionCell);

                orphanTbody.appendChild(row);
            }
            orphanTable.appendChild(orphanTbody);
            orphanSection.appendChild(orphanTable);

            container.appendChild(orphanSection);
        }

        return container;
    }

    /** @override */
    _replaceHTML(result, content) {
        content.replaceChildren(result);
    }

    // -----------------------------------------------------------------------
    //  Row Builder
    // -----------------------------------------------------------------------

    _buildRow(item) {
        const row = document.createElement("tr");
        row.classList.add("nsl-manager-row");
        row.dataset.lockKey = item.lockKey;
        row.dataset.lockType = item.lockType;
        row.dataset.itemType = item.itemType;
        row.dataset.searchText = `${item.name} ${item.moduleTitle} ${item.key}`.toLowerCase();

        // --- Lock control cell ---
        const lockCell = document.createElement("td");
        lockCell.classList.add("nsl-col-lock");
        const lockBtn = document.createElement("a");
        lockBtn.classList.add("nsl-lock-control", `nsl-${item.lockType}`);
        lockBtn.dataset.lockKey = item.lockKey;

        const lockIcon = document.createElement("i");
        if (item.lockType === "none") {
            lockIcon.className = "fa-solid fa-lock-open";
            lockBtn.title = game.i18n.localize("NSL.LockType.None");
        } else if (item.lockType === "soft") {
            lockIcon.className = "fa-solid fa-lock";
            lockBtn.title = game.i18n.localize("NSL.LockType.Soft");
        } else {
            lockIcon.className = "fa-solid fa-lock";
            lockBtn.title = game.i18n.localize("NSL.LockType.Hard");
        }
        lockBtn.appendChild(lockIcon);

        lockBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            await this._cycleLock(item.lockKey, item, "forward");
        });
        lockBtn.addEventListener("contextmenu", async (e) => {
            e.preventDefault();
            await this._cycleLock(item.lockKey, item, "backward");
        });

        lockCell.appendChild(lockBtn);
        row.appendChild(lockCell);

        // --- Type cell ---
        const typeCell = document.createElement("td");
        typeCell.classList.add("nsl-col-type");
        const typeBadge = document.createElement("span");
        typeBadge.classList.add("nsl-type-badge", `nsl-type-${item.itemType}`);
        if (item.itemType === "keybinding") {
            typeBadge.innerHTML = `<i class="fa-solid fa-keyboard"></i>`;
            typeBadge.title = game.i18n.localize("NSL.Manager.TypeControl");
        } else {
            typeBadge.innerHTML = `<i class="fa-solid fa-gear"></i>`;
            typeBadge.title = game.i18n.localize("NSL.Manager.TypeSetting");
        }
        typeCell.appendChild(typeBadge);
        row.appendChild(typeCell);

        // --- Name cell (safe: use textContent, not innerHTML) ---
        const nameCell = document.createElement("td");
        nameCell.classList.add("nsl-col-setting");
        const nameSpan = document.createElement("span");
        nameSpan.classList.add("nsl-setting-name");
        nameSpan.textContent = item.name;
        nameCell.appendChild(nameSpan);
        if (item.hint) {
            const hintSpan = document.createElement("span");
            hintSpan.classList.add("nsl-setting-hint");
            hintSpan.textContent = item.hint;
            nameCell.appendChild(hintSpan);
        }
        row.appendChild(nameCell);

        // --- Module cell ---
        const modCell = document.createElement("td");
        modCell.classList.add("nsl-col-module");
        modCell.textContent = item.moduleTitle;
        row.appendChild(modCell);

        // --- Value cell ---
        const valCell = document.createElement("td");
        valCell.classList.add("nsl-col-value");

        const isLocked = item.lockType !== "none";
        const inputEl = item.itemType === "keybinding"
            ? this._buildKeybindingDisplay(item, isLocked)
            : this._buildValueInput(item, isLocked);
        valCell.appendChild(inputEl);
        row.appendChild(valCell);

        return row;
    }

    // -----------------------------------------------------------------------
    //  Value Input Builder (Settings)
    // -----------------------------------------------------------------------

    _buildValueInput(item, isLocked) {
        const { meta, effectiveValue, lockKey } = item;
        const wrapper = document.createElement("div");
        wrapper.classList.add("nsl-value-control");

        let input;

        // --- Choices dropdown ---
        if (meta.choices) {
            input = document.createElement("select");
            input.classList.add("nsl-value-input");
            for (const [optValue, optLabel] of Object.entries(meta.choices)) {
                const option = document.createElement("option");
                option.value = optValue;
                option.textContent = game.i18n.localize(optLabel);
                if (String(effectiveValue) === String(optValue)) option.selected = true;
                input.appendChild(option);
            }
            input.addEventListener("change", () => this._onValueChange(lockKey, input.value));
        }

        // --- Boolean checkbox ---
        else if (meta.type === "Boolean") {
            input = document.createElement("input");
            input.type = "checkbox";
            input.classList.add("nsl-value-input", "nsl-value-checkbox");
            input.checked = !!effectiveValue;
            input.addEventListener("change", () => this._onValueChange(lockKey, input.checked));
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
            rangeInput.addEventListener("input", () => { numberDisplay.textContent = rangeInput.value; });
            rangeInput.addEventListener("change", () => { this._onValueChange(lockKey, Number(rangeInput.value)); });
            rangeWrapper.append(rangeInput, numberDisplay);
            input = rangeWrapper;
        }

        // --- Number (plain) ---
        else if (meta.type === "Number") {
            input = document.createElement("input");
            input.type = "number";
            input.classList.add("nsl-value-input");
            input.value = effectiveValue ?? 0;
            input.addEventListener("change", () => this._onValueChange(lockKey, Number(input.value)));
        }

        // --- Color ---
        else if (meta.isColor) {
            input = document.createElement("input");
            input.type = "color";
            input.classList.add("nsl-value-input", "nsl-value-color");
            input.value = effectiveValue || "#000000";
            input.addEventListener("change", () => this._onValueChange(lockKey, input.value));
        }

        // --- Object / Array (show as JSON) ---
        else if (meta.type === "Object" || meta.type === "Array") {
            input = document.createElement("textarea");
            input.classList.add("nsl-value-input", "nsl-value-json");
            input.rows = 2;
            try {
                input.value = JSON.stringify(effectiveValue, null, 2);
            } catch {
                input.value = String(effectiveValue);
            }
            input.addEventListener("change", () => {
                try {
                    this._onValueChange(lockKey, JSON.parse(input.value));
                } catch {
                    ui.notifications.warn("Invalid JSON value.");
                }
            });
        }

        // --- String (default) ---
        else {
            input = document.createElement("input");
            input.type = "text";
            input.classList.add("nsl-value-input");
            input.value = effectiveValue ?? "";
            input.addEventListener("change", () => this._onValueChange(lockKey, input.value));
        }

        if (!isLocked) _setReadOnly(input, true);
        wrapper.appendChild(input);
        return wrapper;
    }

    // -----------------------------------------------------------------------
    //  Keybinding Value Display
    // -----------------------------------------------------------------------

    _buildKeybindingDisplay(item, isLocked) {
        const wrapper = document.createElement("div");
        wrapper.classList.add("nsl-value-control", "nsl-keybinding-value");

        const bindings = item.effectiveValue;
        const badgeContainer = document.createElement("div");
        badgeContainer.classList.add("nsl-keybinding-badges");

        if (Array.isArray(bindings) && bindings.length > 0) {
            for (const binding of bindings) {
                const badge = document.createElement("span");
                badge.classList.add("nsl-key-badge");
                badge.textContent = _formatBinding(binding);
                badgeContainer.appendChild(badge);
            }
        } else {
            const empty = document.createElement("span");
            empty.classList.add("nsl-key-badge", "nsl-key-unbound");
            empty.textContent = "—";
            badgeContainer.appendChild(empty);
        }

        wrapper.appendChild(badgeContainer);

        if (!isLocked) wrapper.classList.add("nsl-readonly");

        return wrapper;
    }

    // -----------------------------------------------------------------------
    //  Value Change Handler
    // -----------------------------------------------------------------------

    async _onValueChange(lockKey, newValue) {
        const map = getLockMap();
        const lock = map[lockKey];
        if (!lock) return;

        await setLock(lockKey, lock.type, newValue);
        refreshHardLockSet();
        game.socket.emit(SOCKET_CHANNEL, { action: "apply-locks" });
    }

    // -----------------------------------------------------------------------
    //  Filtering
    // -----------------------------------------------------------------------

    _applyFilter(container, filterText, lockedOnly) {
        const text = (filterText || "").toLowerCase().trim();
        const checkbox = container.querySelector(".nsl-show-locked-checkbox");
        if (lockedOnly === undefined && checkbox) lockedOnly = checkbox.checked;

        const rows = container.querySelectorAll(".nsl-manager-row");
        let visibleCount = 0;
        for (const row of rows) {
            // Skip orphaned rows — they are always visible
            if (row.classList.contains("nsl-orphaned-row")) continue;

            const searchText = row.dataset.searchText || "";
            const lockType = row.dataset.lockType || "none";

            let visible = true;
            if (text && !searchText.includes(text)) visible = false;
            if (lockedOnly && lockType === "none") visible = false;

            row.style.display = visible ? "" : "none";
            if (visible) visibleCount++;
        }

        // Show/hide the "no results" row
        const emptyRow = container.querySelector(".nsl-empty-row");
        if (emptyRow) {
            emptyRow.style.display = visibleCount === 0 ? "" : "none";
        } else if (visibleCount === 0) {
            // Dynamically insert an empty row if filtering hid everything
            const tbody = container.querySelector(".nsl-manager-table tbody");
            if (tbody) {
                const noResults = document.createElement("tr");
                noResults.classList.add("nsl-empty-row", "nsl-filter-empty");
                const cell = document.createElement("td");
                cell.colSpan = 5;
                cell.textContent = game.i18n.localize("NSL.Manager.NoResults");
                noResults.appendChild(cell);
                tbody.appendChild(noResults);
            }
        } else {
            // Remove any dynamic empty row
            const filterEmpty = container.querySelector(".nsl-filter-empty");
            if (filterEmpty) filterEmpty.remove();
        }
    }

    // -----------------------------------------------------------------------
    //  Lock Cycling
    // -----------------------------------------------------------------------

    async _cycleLock(lockKey, item, direction) {
        // Guard against rapid double-clicks
        if (this._lockCycleInProgress) return;
        this._lockCycleInProgress = true;

        try {
            const map = getLockMap();
            const lock = map[lockKey] ?? null;

            // Get current value based on item type
            let value;
            if (item.itemType === "keybinding") {
                const [namespace, ...actionParts] = item.key.split(".");
                value = game.keybindings.get(namespace, actionParts.join("."));
            } else {
                const [namespace, ...keyParts] = item.key.split(".");
                value = game.settings.get(namespace, keyParts.join("."));
            }

            if (direction === "forward") {
                if (!lock) {
                    await setLock(lockKey, "soft", value);
                } else if (lock.type === "soft") {
                    await setLock(lockKey, "hard", value);
                } else {
                    await removeLock(lockKey);
                }
            } else {
                if (!lock) {
                    await setLock(lockKey, "hard", value);
                } else if (lock.type === "hard") {
                    await setLock(lockKey, "soft", value);
                } else {
                    await removeLock(lockKey);
                }
            }

            refreshHardLockSet();
            game.socket.emit(SOCKET_CHANNEL, { action: "apply-locks" });
            this.render();
        } finally {
            this._lockCycleInProgress = false;
        }
    }
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a Foundry setting type to a simple string.
 * Handles V14 DataField types alongside classic constructor types.
 */
function _resolveType(type) {
    if (!type) return "String";

    // Classic constructor types
    if (type === Boolean || type?.name === "Boolean") return "Boolean";
    if (type === Number || type?.name === "Number") return "Number";
    if (type === String || type?.name === "String") return "String";
    if (type === Object || type?.name === "Object") return "Object";
    if (type === Array || type?.name === "Array") return "Array";

    // V14 DataField types
    try {
        if (type instanceof foundry.data.fields.BooleanField) return "Boolean";
        if (type instanceof foundry.data.fields.NumberField) return "Number";
        if (type instanceof foundry.data.fields.StringField) return "String";
        if (type instanceof foundry.data.fields.ObjectField) return "Object";
        if (type instanceof foundry.data.fields.ArrayField) return "Array";
        if (type instanceof foundry.data.fields.ColorField) return "String";
    } catch {
        // DataField classes may not exist — ignore
    }

    return "String";
}

/**
 * Check if a setting type or value represents a CSS color.
 */
function _isColorType(type, value) {
    try {
        if (type === foundry.data.fields.ColorField) return true;
        if (type instanceof foundry.data.fields.ColorField) return true;
    } catch { /* ignore */ }
    if (typeof type === "function" && type.name === "Color") return true;
    return _looksLikeColor(value);
}

function _looksLikeColor(value) {
    if (typeof value !== "string") return false;
    return /^#[0-9a-fA-F]{6,8}$/.test(value);
}

/**
 * Format a keybinding binding object to a human-readable string.
 * e.g. { key: "KeyA", modifiers: ["CONTROL", "SHIFT"] } → "Ctrl + Shift + A"
 */
function _formatBinding(binding) {
    if (!binding || !binding.key) return "—";
    const parts = [];
    if (binding.modifiers) {
        for (const mod of binding.modifiers) {
            if (mod === "CONTROL") parts.push("Ctrl");
            else if (mod === "SHIFT") parts.push("Shift");
            else if (mod === "ALT") parts.push("Alt");
            else if (mod === "META") parts.push("Meta");
            else parts.push(mod);
        }
    }
    // Convert KeyboardEvent.code to a readable key name
    let keyName = binding.key;
    if (keyName.startsWith("Key")) keyName = keyName.slice(3);
    else if (keyName.startsWith("Digit")) keyName = keyName.slice(5);
    else if (keyName.startsWith("Numpad")) keyName = "Num" + keyName.slice(6);
    else if (keyName === "Space") keyName = "Space";
    else if (keyName === "ArrowUp") keyName = "↑";
    else if (keyName === "ArrowDown") keyName = "↓";
    else if (keyName === "ArrowLeft") keyName = "←";
    else if (keyName === "ArrowRight") keyName = "→";

    parts.push(keyName);
    return parts.join(" + ");
}

function _setReadOnly(el, readOnly) {
    if (!el) return;
    const inputs = el.querySelectorAll ? el.querySelectorAll("input, select, textarea") : [];
    const targets = inputs.length > 0 ? inputs : [el];

    for (const target of targets) {
        if (readOnly) {
            target.classList.add("nsl-readonly");
            if (target.tagName === "SELECT") target.disabled = true;
            else if (target.type === "checkbox") target.disabled = true;
            else target.readOnly = true;
        } else {
            target.classList.remove("nsl-readonly");
            target.disabled = false;
            target.readOnly = false;
        }
    }
}
