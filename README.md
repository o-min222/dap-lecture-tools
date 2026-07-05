# DAP Lecture Tools

Lecture Tools plugin for DAP.

## What It Provides

- Plugin actions for lecture overlay controls
- Rebindable shortcuts
- Radial menu and tray menu entries
- Basic settings for cursor, drawing, and spotlight options

## Current Host Requirement

This plugin expects DAP host support for `ctx.host.presentation` with the
`presentation.overlay` permission.

Until that host service lands, the plugin loads safely and shows a short DAP
bubble explaining that the presentation overlay update is required.

## Files

- `plugin.yaml`
- `dap_lecture_tools/plugin.mjs`

