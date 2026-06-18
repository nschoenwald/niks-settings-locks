# Changelog

All notable changes to Nik's Settings Locks are documented in this file.

## [14.0.4] — 2026-06-18

### Fixed
- **Permission error with world-scoped settings** — Added scope guards to the enforcement wrapper and hard-lock set. If a world-scoped setting key ever ended up in the lock map (e.g. via JSON import), the wrapper could attempt to write the lock value from a non-GM client, causing a `"User lacks permission to update Setting"` error. The wrapper now verifies scope before intervening and silently passes through any write to a non-client-scoped setting.

## [14.0.3] — 2026-06-17

### Added
- **Hidden/Menu Settings in Lock Manager** — Settings that are managed through sub-menus (e.g. core interface settings, AV configuration) now appear in the Lock Manager. These were previously excluded because they don't show up in the main Settings Configuration window. A small `MENU` tag indicates which settings come from sub-menus. The module's own internal settings remain excluded.
- **Type Filter Buttons** — The Lock Manager toolbar now has segmented filter buttons (All / ⚙️ Settings / ⌨️ Controls) to quickly narrow the list to only settings or only keybinding controls. Works in combination with the text search and "Show locked only" filters.

## [14.0.2] — 2026-06-15

### Fixed
- **Socket listener registered too early** — Moved socket listener registration from the `init` hook to `ready`, where `game.socket` is guaranteed to be available.
- **GM self-notification** — The GM no longer receives their own "Locks have been updated by the GM" notification when changing locks. Socket listener now skips re-application for the GM sender.
- **Filter checkbox ignored** — The "Show locked only" checkbox in the Lock Manager was silently ignored due to an incorrect default parameter. Now works correctly.
- **innerHTML with user strings** — Setting names and hints in the Lock Manager are now set via `textContent` instead of `innerHTML`, preventing potential HTML injection from module-provided strings.
- **Import validation** — Imported lock entries are now validated to have a valid type (`soft` or `hard`). Invalid entries are skipped with a console warning.
- **Soft lock cleanup** — Removing a lock now also cleans up the corresponding soft-lock revision entry from localStorage, preventing stale data buildup.

### Improved
- **V14 DataField support** — The Lock Manager type resolver now handles V14 `DataField` types (`BooleanField`, `NumberField`, `StringField`, `ObjectField`, `ArrayField`, `ColorField`) alongside classic constructor types.
- **Object/Array value editing** — Settings of type `Object` or `Array` now display as a JSON textarea in the Lock Manager instead of showing `[object Object]`.
- **Deep equality** — Value comparison now uses `foundry.utils.objectsEqual()` (V14+) for order-independent object comparison, falling back to `JSON.stringify` only when unavailable.
- **Safer app re-rendering** — Socket updates now use `foundry.applications.instances` (V14) to find and re-render open config windows instead of class-level `.instances()` which may not exist.
- **Race condition guard** — Lock cycling in the Lock Manager now uses an in-progress flag to prevent rapid double-clicks from causing stale reads.
- **Empty state** — The Lock Manager now shows a "No lockable items match your filter" message when filtering yields no results.
- **Removed unused i18n keys** — Cleaned up localization keys that were defined but never referenced in code (`LockSet`, `LockRemoved`, `GMOnly`, `Export.DialogTitle`).
- **Module description** — Updated `module.json` description to mention keybinding controls alongside settings.

## [14.0.1] — 2026-06-15

### Added
- **Keybinding (Controls) Lock Support** — Lock keybinding configurations the same way as settings. Lock icons appear in the Configure Controls window with the same click/right-click cycling.
- **Lock Manager: Keybinding Entries** — The Lock Manager now lists both settings and keybindings. A new Type column with ⚙️/⌨️ icons distinguishes between them. Keybinding values display as key combo badges (e.g. `Ctrl + Shift + A`).
- **Orphaned Lock Detection** — The Lock Manager now detects locks that reference unregistered settings or controls (e.g. from uninstalled modules). An "Orphaned Locks" section appears at the bottom with individual and bulk delete options.
- **Re-enforce Soft Locks** — New button (in both Settings Config and Lock Manager) to re-publish all soft locks with a bumped revision, so players receive the GM's values again on their next login.
- **Clear All Locks** — New button to remove all locks at once, available in both the Settings Config module section and the Lock Manager toolbar.
- **GM Runtime Exemption** — GMs are no longer blocked by lock enforcement at runtime. Locks are still applied to GM clients on page load, but GMs can freely change settings and controls while managing locks.

### Changed
- **Proper Singular/Plural** — All notification messages now use correct singular and plural forms instead of `lock(s)`.
- **Localization** — Tooltip and notification strings updated to be generic (covering both settings and controls).

### Fixed
- **SettingsConfig Save Errors** — Resolved crashes when saving settings that were hard-locked, by using libWrapper (WRAPPER type) instead of manual monkey-patching for `ClientSettings.prototype.set`.

## [14.0.0] — 2026-06-11

### Added
- Initial release for Foundry VTT V14.
- **Hard Lock** 🔴 — Forces settings to the GM's value. Players cannot change them.
- **Soft Lock** 🟡 — Applies the GM's value once. Players may override permanently.
- **Inline Lock Icons** — Lock toggles in the Settings Configuration window.
- **Lock Manager** — Dedicated ApplicationV2 window for managing all locks with type-appropriate value editors.
- **Export / Import** — Save and restore lock configurations as JSON.
- **Live Enforcement** — Socket-based real-time lock broadcasting to all clients.
- **libWrapper Integration** — Safe method wrapping via lib-wrapper dependency.
