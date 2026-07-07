# DAP Lecture Tools

Lecture Tools plugin for DAP.

## Install

Use the DAP plugin catalog entry:

```json
{
  "id": "dap.lecture_tools",
  "name": "Lecture Tools",
  "description": "강사용 커서 강조, 판서, spotlight 오버레이 컨트롤",
  "repo": "o-min222/dap-lecture-tools",
  "ref": "v0.3.25"
}
```

Manual download:

- Release: https://github.com/o-min222/dap-lecture-tools/releases/tag/v0.3.25
- Source zip: https://github.com/o-min222/dap-lecture-tools/archive/refs/tags/v0.3.25.zip

## What It Provides

- A compact paint-like palette window
- Plugin actions for lecture overlay controls
- Rebindable shortcuts
- Radial menu and tray menu entries
- Basic settings for cursor, drawing, and spotlight options

## Current Host Requirement

This plugin expects these DAP host services:

- `ctx.host.windows` with the `window.palette` permission
- `ctx.host.presentation` with the `presentation.overlay` permission

The palette can open through the existing DAP palette host. The actual screen
overlay requires `ctx.host.presentation.openOverlay()` to load
`overlay/index.html`, plus message passing, click-through control, and cursor
position reads.

## Architecture Rule

Most feature implementation belongs in the plugin.

The host should provide only the safe privileged surface that a plugin cannot
own itself: overlay window creation, click-through/interactivity control,
cursor position access, message bridging, permission gating, and lifecycle
cleanup.

Tool behavior such as palette UI, drawing state, canvas rendering, cursor
highlighting, click ripple, spotlight rendering, undo, clear, colors, and stroke
width belongs in this plugin.

## Files

- `plugin.yaml`
- `dap_lecture_tools/plugin.mjs`
- `palette/index.html`
- `overlay/index.html`

## Development

Run the local syntax checks before shipping plugin changes:

```sh
npm run check
```
