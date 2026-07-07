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
  "ref": "v0.3.35"
}
```

Manual download:

- Release: https://github.com/o-min222/dap-lecture-tools/releases/tag/v0.3.35
- Source zip: https://github.com/o-min222/dap-lecture-tools/archive/refs/tags/v0.3.35.zip

## What It Provides

- A compact paint-like palette window
- Plugin actions for lecture overlay controls
- Rebindable shortcuts
- Radial menu and tray menu entries
- Basic settings for cursor, drawing, and spotlight options

## Usage Notes

- `Ctrl+Shift+L` toggles the screen canvas on and off. It does not hide the
  palette.
- The palette close button (`X`) closes the palette directly. This is separate
  from drag-and-drop closing.
- Dragging the palette near the pet does not close it. For drag behavior, the
  palette closes only after it is dropped on the pet.
- Pen color and pen width are independent. Changing the color keeps the current
  width, and changing the width keeps the current color.
- Pen width is controlled from the palette with a `1px` to `16px` slider.
- Spotlight size is controlled from the palette with an `80px` to `320px`
  slider.
- The memo button opens a separate always-on-top notice window. Type the notice
  in that clean window, then use `Show`, `Hide`, or the internal `X` button.
- The notice window is independent from the drawing canvas, so it can stay open
  while the screen canvas is hidden or changed.
- Closing the palette also closes the notice window.
- Drag the notice window by its internal handle in the upper-left corner.
- Clicking inside the notice text box registers it as a Super Clipboard paste
  target on hosts that support explicit palette paste targeting.
- Scroll the mouse wheel or use a two-finger trackpad scroll inside the notice
  window to adjust the notice text size.
- The palette is kept above the lecture overlay so controls stay reachable while
  the canvas is visible.

## Current Host Requirement

This plugin expects these DAP host services:

- `ctx.host.windows` with the `window.palette` permission
- `ctx.host.presentation` with the `presentation.overlay` permission

The palette can open through the existing DAP palette host. The actual screen
overlay requires `ctx.host.presentation.openOverlay()` to load
`overlay/index.html`, plus message passing, click-through control, and cursor
position reads. The notice window uses the palette window host to load
`notice/index.html` separately from the overlay. Drop-on-pet closing depends on
the host palette window's `closeOnPetDrop` support. Super Clipboard paste into
the notice window works best on hosts that support explicit palette paste target
registration.

## Architecture Rule

Most feature implementation belongs in the plugin.

The host should provide only the safe privileged surface that a plugin cannot
own itself: overlay window creation, click-through/interactivity control,
cursor position access, message bridging, permission gating, and lifecycle
cleanup.

Tool behavior such as palette UI, drawing state, canvas rendering, cursor
highlighting, click ripple, spotlight rendering and sizing, separate notice
window behavior, undo, clear, colors, and stroke width belongs in this plugin.

## Files

- `plugin.yaml`
- `dap_lecture_tools/plugin.mjs`
- `palette/index.html`
- `overlay/index.html`
- `notice/index.html`

## Development

Run the local syntax checks before shipping plugin changes:

```sh
npm run check
```
