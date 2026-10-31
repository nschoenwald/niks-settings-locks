/**
 * Nik's Settings Locks — Value Formatting
 *
 * Shared helpers for showing setting and keybinding values to users.
 */

/**
 * Format a single keybinding as a readable key combo, the way Configure Controls shows it (e.g. "Control + Shift + K").
 * @param {{key: string, logicalKey?: string, modifiers?: string[]}} binding
 * @returns {string}
 */
export function formatBinding(binding) {
    if (!binding?.key) return "—";
    // humanizeBinding() fails on bindings without a modifiers array
    return foundry.applications.sidebar.apps.ControlsConfig.humanizeBinding({ ...binding, modifiers: binding.modifiers ?? [] });
}

/**
 * Format a setting or keybinding value as short plain text.
 * @param {*} value
 * @param {boolean} [isKeybinding=false]
 * @returns {string}
 */
export function formatValue(value, isKeybinding = false) {
    if (isKeybinding) {
        return Array.isArray(value) && value.length ? value.map(formatBinding).join(", ") : "—";
    }
    if (value === undefined || value === null || value === "") return "—";
    if (typeof value === "boolean") return game.i18n.localize(value ? "Yes" : "No");
    if (typeof value === "object") {
        let text;
        try {
            text = JSON.stringify(value);
        } catch {
            text = String(value);
        }
        return text.length > 60 ? `${text.slice(0, 57)}…` : text;
    }
    return String(value);
}
