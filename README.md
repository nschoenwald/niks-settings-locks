# Nik's Settings Locks

A [FoundryVTT](https://foundryvtt.com/) module that lets the GM **soft-lock** and **hard-lock** client settings and keybinding controls for all connected clients.

Requires [libWrapper](https://foundryvtt.com/packages/lib-wrapper).

---

## Compatibility

- **Foundry VTT**: V14+
- **System**: System-agnostic (works with any game system)
- **Dependency**: Requires [libWrapper](https://foundryvtt.com/packages/lib-wrapper)

---

## Features

- **Hard Lock** 🔴 — Forces the value to the GM's choice for all clients. The UI input is disabled and changes are blocked programmatically.
- **Player Lock** 🔵 — Locks the setting or control for players only, while letting the GM keep their own personal setting. Changes made by the GM remain personal and do not overwrite the locked player value.
- **Soft Lock** 🟡 — Applies the GM's value once. Players may override it permanently. If the GM re-enforces the soft lock, the new value is re-applied.
- **Conflict Guard** 🛡️ — Detects conflicting lock mechanisms from other modules (such as Carolingian UI's generic settings lock), automatically suppresses duplicate icons, and provides a one-click resolution banner for the GM.
- **Settings Support** — Lock any client/user scoped setting from any module, system, or core — including settings managed through sub-menus (e.g. core interface settings, AV configuration).
- **Controls Support** — Lock keybinding (control) configurations, ensuring consistent hotkeys across all clients.
- **Inline Lock Icons** — Lock toggle icons appear next to every lockable item in both the Settings Configuration and Configure Controls windows.
- **Lock Manager** — A dedicated management window with a filterable table of all lockable settings and controls, type-appropriate value editors, keybinding display, type filter buttons (All / Settings / Controls), and quick toggles to filter for locked or hidden settings.
- **Interactive Update Prompt** — When a GM batch-saves changes to settings that are currently soft-locked, an interactive prompt allows them to quickly select which soft locks to update globally for players.
- **Re-enforce Soft Locks** — Re-publish all soft locks with a new revision so players receive the GM's values on their next login.
- **Export / Import** — Save and restore lock configurations as JSON files. Includes setting, keybinding, and player locks.
- **Clear All Locks** — Remove all locks at once from both the Settings Config and the Lock Manager.
- **Live Enforcement** — When the GM changes a lock, all connected clients are updated immediately via socket.

## Lock Behavior

| | Soft Lock | Player Lock | Hard Lock |
|---|---|---|---|
| Applied on load | Once per revision | Every load (players only) | Every load (all clients) |
| Player can override | ✓ Permanently | ✗ Blocked | ✗ Blocked |
| UI indicator | 🟡 Yellow lock | 🔵 Blue user-lock | 🔴 Red lock |
| Input disabled | No | Yes (players only) | Yes (all clients) |
| GM personal value | Shared (prompts GM on change) | ✓ Independent (GM customizes freely) | Follows GM lock value |
| GM re-sets lock | Re-applies (new revision) | Controlled in Lock Manager | Always enforced |

### GM Enforcement

Locks are applied on page load. For **Hard Locks**, values are enforced across all clients. For **Player Locks**, values are enforced on players while the GM retains their personal setting. At runtime, GMs are exempt from the enforcement wrapper — they can freely change settings or controls, remove locks, and save without being blocked.

## Usage

### Inline Controls (Settings Config)
1. Open **Settings → Configure Settings**
2. Lock icons appear to the left of each client/user setting name
3. **Click** to cycle: Unlocked → Soft Lock → Hard Lock → Player Lock → Unlocked
4. **Right-click** to cycle backward: Unlocked → Player Lock → Hard Lock → Soft Lock → Unlocked
5. **Alt+Click** to toggle directly to Player Lock
6. Changes are saved immediately and broadcast to all clients

### Inline Controls (Configure Controls)
1. Open **Settings → Configure Controls**
2. Lock icons appear next to each keybinding action
3. Same click / right-click / Alt+click cycling as settings

### Lock Manager
1. Open **Settings → Module Settings → Nik's Settings Locks → Open Lock Manager**
2. Browse, filter, and manage locks for all settings and controls in one place
3. Settings show type-appropriate input controls; keybindings show key combo badges
4. Use the toolbar buttons for export, import, re-enforce, and bulk clear

### Re-enforcing Soft Locks
Soft locks are applied only once per revision. If players have overridden a soft-locked value, clicking **Re-enforce Soft Locks** bumps the revision of all soft locks. Players will receive the GM's values again on their next login.

## Dependencies

- **[libWrapper](https://foundryvtt.com/packages/lib-wrapper)** — Required for safe method wrapping in Foundry V14.

---

## Other Modules by Nik

### 🎲 D&D 5e Specific
* **[Nik's DnD5e Tweaks](https://github.com/nschoenwald/niks-dnd5e-tweaks)** – Consolidated collection of quality-of-life enhancements and combat automation tweaks for DnD5e.

### ⚔️ Combat & Token Tools
* **[Nik's Action HUD](https://github.com/nschoenwald/niks-action-hud)** – Sleek, modern canvas-docked Action HUD for quick access to attacks, spells, inventory, and utility rolls.
* **[Nik's Token Tags](https://github.com/nschoenwald/niks-token-tags)** – Automatically numbers duplicate combatant NPCs (A, B, C…) with color-coded letter overlays.
* **[Nik's Shared NPC Initiative](https://github.com/nschoenwald/niks-shared-npc-initiative)** – Groups NPCs of the same type in combat so they share a single initiative roll.
* **[Nik's Movement Control](https://github.com/nschoenwald/niks-movement-control)** – GM controls to toggle player movement and automatically restrict/allow movement on combat start and end.
* **[Nik's Tiny Change Logs](https://github.com/nschoenwald/niks-tiny-changelogs)** – Compact, single-line chat messages logging token HP and Temp HP changes.

### 🎲 Visuals & Display
* **[Nik's Dynamic Roll Area](https://github.com/nschoenwald/niks-dynamic-roll-area)** – Dynamically restricts Dice So Nice 3D dice rolling area to exclude the sidebar / chat log across all screen resolutions and window sizes.

### ⚙️ Utilities & System Management
* **[Nik's Compendium Search Tweaks](https://github.com/nschoenwald/niks-compendium-search-tweaks)** – Configure which compendium packs are included or excluded from native sidebar search.
* **[Nik's Show & Tell](https://github.com/nschoenwald/niks-show-and-tell)** – Share popout images to chat and paste image files directly into chat messages.
* **[Nik's Zoom / Pan Options](https://github.com/nschoenwald/niks-zoom-pan-options)** – Touchpad and scroll wheel pan/zoom controls and canvas navigation enhancements.
