# Nik's Settings Locks

A [FoundryVTT](https://foundryvtt.com/) module that lets the GM **suggest** or **lock** client settings and keybinding controls for all connected players.

Requires [libWrapper](https://foundryvtt.com/packages/lib-wrapper).

---

## Compatibility

- **Foundry VTT**: V14+
- **System**: System-agnostic (works with any game system)
- **Dependency**: Requires [libWrapper](https://foundryvtt.com/packages/lib-wrapper)

---

## Features

- **Locked for players** 🔵 — Players are kept on the locked value, while the GM keeps their own personal setting.
- **Locked for everyone** 🔴 — Everyone, including the GM, is kept on the locked value. The UI input is disabled and changes are blocked programmatically.
- **Suggested value** 📌 — Players get the GM's value once and can change it afterwards. The GM can re-send suggested values at any time.
- **Lock Picker** — Click any lock icon to choose an option from a menu that explains each one. Works with the keyboard too (Tab to the icon, then Enter or Space).
- **Conflict Guard** 🛡️ — Detects when Carolingian UI's generic settings lock is turned on and shows GMs a banner with a one-click button to turn it off. While the banner is shown, Carolingian's duplicate lock icons are hidden for the GM (players still see them, since Carolingian keeps enforcing its locks until it's turned off).
- **Settings Support** — Lock any client/user scoped setting from any module, system, or core — including settings managed through sub-menus (e.g. core interface settings, AV configuration).
- **Controls Support** — Lock keybinding (control) configurations, ensuring consistent hotkeys across all clients.
- **Inline Lock Icons** — Lock icons appear next to every lockable item in both the Configure Settings and Configure Controls windows.
- **Lock Manager** — A dedicated management window with a filterable table of all lockable settings and controls, type-appropriate value editors, keybinding display, type filter buttons (All / Settings / Controls), and quick toggles to filter for locked or hidden settings.
- **Update Prompt** — When the GM changes items that have a suggested value or are locked for everyone, a prompt shows the old and new values and lets them choose which ones to update for players. For items locked for everyone, declined changes are undone.
- **Re-send Suggested Values** — Send all suggested values to players again, even to players who changed them. Connected players get them right away, others on their next login.
- **Export / Import** — Save and restore lock configurations as JSON files, including setting and keybinding locks.
- **Clear All Locks** — Remove all locks at once from both the Settings Config and the Lock Manager.
- **Live Enforcement** — When the GM changes a lock, all connected clients are updated immediately via socket.

## Lock Behavior

| | Suggested value | Locked for players | Locked for everyone |
|---|---|---|---|
| Icon | 📌 Yellow pin | 🔵 Blue user-lock | 🔴 Red lock |
| Applied to players | Once (until re-sent) | Every load | Every load |
| Player can change it | ✓ | ✗ Blocked | ✗ Blocked |
| Applied to the GM | ✗ | ✗ (GM keeps their own value) | ✓ |
| Input disabled | No | Yes (players only) | Yes (everyone) |
| Changing the locked value | GM changes their own setting, then confirms in the prompt | Lock Manager: edit the value (settings) or copy your bindings (controls) | GM changes the setting, then confirms in the prompt |

Locking an unlocked item uses your current value. Changing an existing lock to another option keeps its locked value; switching to **Locked for everyone** applies that value to you as well.

### Who can manage locks

Two settings control who can manage locks:

- **Minimum Role for Lock Management** — Game Master (default), Assistant GM or Trusted Player. Trusted Players can't save world settings themselves, so their changes are saved through a logged-in GM — a GM must be online for them to change locks.
- **Allow Users Who Can Modify Settings** (on by default) — anyone with Foundry's *Modify Configuration Settings* permission can also manage locks, whatever their role. Assistant GMs have this permission by default.

Lock managers aren't affected by suggested values or player locks (only by "Locked for everyone"). If you grant *Modify Configuration Settings* to regular players, turn the second setting off so locks still apply to them.

## Usage

### Configure Settings and Configure Controls
1. Open **Settings → Configure Settings** or **Settings → Configure Controls**
2. A lock icon appears to the left of each client/user setting and each control
3. **Click** the icon (or Tab to it and press Enter) to open the lock picker, then choose an option
4. Changes are saved immediately and sent to all connected clients

Players see the icon only on items that have a suggested value or are locked; hovering it explains what the GM set.

### Lock Manager
1. Open **Settings → Module Settings → Nik's Settings Locks → Open Lock Manager**
2. Browse, filter, and manage locks for all settings and controls in one place
3. Settings show type-appropriate input controls; keybindings show key combo badges
4. Use the toolbar buttons to export, import, re-send suggested values, or clear all locks

### Re-sending Suggested Values
A suggested value is applied to each player only once, so players can change it afterwards. Clicking **Re-send Suggested Values** sends all suggested values again: connected players get them right away, others on their next login.

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
