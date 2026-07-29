# Nik's Settings Locks

A [FoundryVTT](https://foundryvtt.com/) module that lets the GM **soft-lock** and **hard-lock** client settings and keybinding controls for all connected clients.

Requires [libWrapper](https://foundryvtt.com/packages/lib-wrapper).

---

## Compatibility

- **Foundry VTT**: V13 – V14
- **System**: System-agnostic (works with any game system)
- **Dependency**: Requires [libWrapper](https://foundryvtt.com/packages/lib-wrapper)
---

## Features

- **Hard Lock** 🔴 — Forces the value to the GM's choice. Players cannot change it. The UI input is disabled and changes are blocked programmatically.
- **Soft Lock** 🟡 — Applies the GM's value once. Players may override it permanently. If the GM re-enforces the soft lock, the new value is re-applied.
- **Settings Support** — Lock any client/user scoped setting from any module, system, or core — including settings managed through sub-menus (e.g. core interface settings, AV configuration).
- **Controls Support** — Lock keybinding (control) configurations, ensuring consistent hotkeys across all clients.
- **Inline Lock Icons** — Lock toggle icons appear next to every lockable item in both the Settings Configuration and Configure Controls windows.
- **Lock Manager** — A dedicated management window with a filterable table of all lockable settings and controls, type-appropriate value editors, keybinding display, and type filter buttons (All / Settings / Controls) for quick navigation.
- **Interactive Update Prompt** — When a GM batch-saves changes to settings that are currently soft-locked, an interactive prompt allows them to quickly select which soft locks to update globally for players.
- **Re-enforce Soft Locks** — Re-publish all soft locks with a new revision so players receive the GM's values on their next login.
- **Export / Import** — Save and restore lock configurations as JSON files. Includes both setting and keybinding locks.
- **Clear All Locks** — Remove all locks at once from both the Settings Config and the Lock Manager.
- **Live Enforcement** — When the GM changes a lock, all connected clients are updated immediately via socket.

## Lock Behavior

| | Soft Lock | Hard Lock |
|---|---|---|
| Applied on load | Once per revision | Every load |
| Player can override | ✓ Permanently | ✗ Blocked |
| UI indicator | 🟡 Yellow lock | 🔴 Red lock |
| Input disabled | No | Yes (for non-GM) |
| GM re-sets lock | Re-applies (new revision) | Always enforced |
| GM exempt at runtime | ✓ | ✓ |

### GM Enforcement

Locks are applied to **all clients** (including GMs) on page load. At runtime, GMs are exempt from the enforcement wrapper — they can freely change settings or controls, remove locks, and save without being blocked.

## Usage

### Inline Controls (Settings Config)
1. Open **Settings → Configure Settings**
2. Lock icons appear to the left of each client/user setting name
3. **Click** to cycle: Unlocked → Soft → Hard → Unlocked
4. **Right-click** to cycle backward: Unlocked → Hard → Soft → Unlocked
5. Changes are saved immediately and broadcast to all clients

### Inline Controls (Configure Controls)
1. Open **Settings → Configure Controls**
2. Lock icons appear next to each keybinding action
3. Same click/right-click cycling as settings

### Lock Manager
1. Open **Settings → Module Settings → Nik's Settings Locks → Open Lock Manager**
2. Browse, filter, and manage locks for all settings and controls in one place
3. Settings show type-appropriate input controls; keybindings show key combo badges
4. Use the toolbar buttons for export, import, re-enforce, and bulk clear

### Re-enforcing Soft Locks
Soft locks are applied only once per revision. If players have overridden a soft-locked value, clicking **Re-enforce Soft Locks** bumps the revision of all soft locks. Players will receive the GM's values again on their next login.

## Dependencies

- **[libWrapper](https://foundryvtt.com/packages/lib-wrapper)** — Required for safe method wrapping in Foundry V14.

## Compatibility

- **Foundry VTT**: V14+
- **System**: Any (system-agnostic)

---

## Other Modules by Nik

### 🎲 D&D 5e Specific
* **[Nik's DnD5e Tweaks](https://github.com/nschoenwald/niks-dnd5e-tweaks)** – Consolidated collection of quality-of-life enhancements and combat automation tweaks for DnD5e.

### ⚔️ Combat & Token Tools
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
