# DAP Lecture Tools

Lecture Tools plugin for DAP.

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
overlay still requires `ctx.host.presentation`.

## Files

- `plugin.yaml`
- `dap_lecture_tools/plugin.mjs`
- `palette/index.html`
