/**
 * Nik's Settings Locks — Value Formatting
 *
 * Shared helpers for showing setting and keybinding values to users.
 */

/**
 * Format a single keybinding as a readable key combo, e.g. "Ctrl + Shift + K".
 * @param {{key: string, modifiers?: string[]}} binding
 * @returns {string}
 */
export function formatBinding(binding) {
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
    else if (keyName === "ArrowUp") keyName = "↑";
    else if (keyName === "ArrowDown") keyName = "↓";
    else if (keyName === "ArrowLeft") keyName = "←";
    else if (keyName === "ArrowRight") keyName = "→";

    parts.push(keyName);
    return parts.join(" + ");
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
