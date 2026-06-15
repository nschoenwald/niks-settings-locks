# Changelog

All notable changes to Nik's Settings Locks are documented in this file.

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
