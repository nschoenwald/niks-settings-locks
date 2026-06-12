# Nik's Settings Locks

A [FoundryVTT](https://foundryvtt.com/) module that lets the GM **soft-lock** and **hard-lock** client settings and keybinding controls for all connected clients.

Requires [libWrapper](https://foundryvtt.com/packages/lib-wrapper).

## Features

- **Hard Lock** 🔴 — Forces the value to the GM's choice. Players cannot change it. The UI input is disabled and changes are blocked programmatically.
- **Soft Lock** 🟡 — Applies the GM's value once. Players may override it permanently. If the GM re-enforces the soft lock, the new value is re-applied.
- **Settings Support** — Lock any client/user scoped setting from any module, system, or core.
- **Controls Support** — Lock keybinding (control) configurations, ensuring consistent hotkeys across all clients.
- **Inline Lock Icons** — Lock toggle icons appear next to every lockable item in both the Settings Configuration and Configure Controls windows.
- **Lock Manager** — A dedicated management window with a filterable table of all lockable settings and controls, type-appropriate value editors, and keybinding display.
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

## Installation

### Method 1: Manifest URL
Paste the following URL into Foundry's **Install Module** dialog:
```
https://github.com/nschoenwald/niks-settings-locks/releases/latest/download/module.json
```

### Method 2: Manual
Download the latest `module.zip` from [Releases](https://github.com/nschoenwald/niks-settings-locks/releases) and extract it into your `Data/modules/` directory.

## Dependencies

- **[libWrapper](https://foundryvtt.com/packages/lib-wrapper)** — Required for safe method wrapping in Foundry V14.

## Compatibility

- **Foundry VTT**: V14+
- **System**: Any (system-agnostic)

## License

MIT License — see [LICENSE](LICENSE) for details.
