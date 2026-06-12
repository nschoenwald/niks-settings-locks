# Nik's Settings Locks

A [FoundryVTT](https://foundryvtt.com/) module that lets the GM **soft-lock** and **hard-lock** client and user settings for all connected clients.

Requires [libWrapper](https://foundryvtt.com/packages/lib-wrapper).

## Features

- **Hard Lock** 🔴 — Forces the setting to the GM's value. Players (and other GM clients) cannot change it. The UI input is disabled and changes are blocked programmatically.
- **Soft Lock** 🟡 — Applies the GM's value once. Players may override it permanently. If the GM re-enforces the soft lock, the new value is re-applied.
- **Inline Lock Icons** — Lock toggle icons appear next to every client/user scoped setting in the Settings Configuration window.
- **Lock Manager** — A dedicated management window (accessible from Module Settings) with a filterable table of all lockable settings and type-appropriate value editors (checkboxes, dropdowns, sliders, color pickers, etc.).
- **Re-enforce Soft Locks** — A button to re-publish all soft locks with a new revision, so players receive the updated values on their next login.
- **Export / Import** — Save and restore lock configurations as JSON files. Useful for migrating between worlds.
- **Clear All Locks** — Remove all locks at once from both the Settings Config and the Lock Manager.
- **Live Enforcement** — When the GM changes a lock, all connected clients are updated immediately via socket — no manual reloads needed.

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

Locks are applied to **all clients** (including GMs) on page load. At runtime, GMs are exempt from the enforcement wrapper — they can freely change settings, remove locks, and save without being blocked. If a GM changes a hard-locked setting, the value reverts on the next page load.

## Usage

### Inline Controls (Settings Config)
1. Open **Settings → Configure Settings**
2. Lock icons appear to the left of each client/user setting name
3. **Click** to cycle: Unlocked → Soft → Hard → Unlocked
4. **Right-click** to cycle backward: Unlocked → Hard → Soft → Unlocked
5. Changes are saved immediately and broadcast to all clients
6. Use the **Export**, **Import**, **Re-enforce Soft Locks**, and **Clear All** buttons in the module settings section

### Lock Manager
1. Open **Settings → Module Settings → Nik's Settings Locks → Open Lock Manager**
2. Browse, filter, and manage locks for all settings in one place
3. Edit locked values directly using type-appropriate input controls
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
