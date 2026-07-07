const PLUGIN_ID = "dap.lecture_tools";
const SETTINGS_LOCAL_ID = "general";
const SETTINGS_FULL_ID = `${PLUGIN_ID}.${SETTINGS_LOCAL_ID}`;

const MOD_CONTROL = 0x2;
const MOD_SHIFT = 0x4;
const PALETTE_LEVEL = "screen-saver";

let paletteHandle = null;
let overlayHandle = null;
let overlayOpened = false;
let overlayVisible = false;
let disposeOverlayMessages = null;
let cursorTimer = null;
let lastDown = false;
let currentMode = "draw";
let currentOptions = {};
let interactiveTimer = null;
let paletteCloseTimer = null;
let activeHotkeys = [];

const DRAWING_MODES = new Set(["draw", "erase", "line", "rect", "ellipse"]);

function presentation(ctx) {
  return ctx.host && ctx.host.presentation;
}

function windows(ctx) {
  return ctx.host && ctx.host.windows;
}

function hotkey(ctx) {
  return ctx.host && ctx.host.hotkey;
}

function speak(ctx, text) {
  try {
    ctx.host && ctx.host.bubble && ctx.host.bubble.speak(text);
  } catch {
    /* bubble is best-effort */
  }
}

function settings(ctx) {
  const hostSettings = ctx.host && ctx.host.settings;
  if (!hostSettings || typeof hostSettings.values !== "function") return {};
  const full = hostSettings.values(SETTINGS_FULL_ID) || {};
  const local = hostSettings.values(SETTINGS_LOCAL_ID) || {};
  return { ...local, ...full };
}

function optionsFromSettings(values) {
  const color = typeof values.color === "string" && values.color ? values.color : "#ffcc00";
  const strokeWidth = Number.parseInt(String(values.strokeWidth || "4"), 10);
  const spotlightSize = Number.parseInt(String(values.spotlightSize || "170"), 10);
  return {
    layout: values.layout === "vertical" ? "vertical" : "horizontal",
    color,
    strokeWidth: Number.isFinite(strokeWidth) ? strokeWidth : 4,
    spotlightSize: Number.isFinite(spotlightSize) ? spotlightSize : 170,
    spotlightDim: 0.62,
  };
}

function mergedOptions(ctx, patch) {
  currentOptions = { ...currentOptions, ...optionsFromSettings(settings(ctx)), ...(patch || {}) };
  return currentOptions;
}

function isAlive(handle) {
  return !!handle && !(typeof handle.isDestroyed === "function" && handle.isDestroyed());
}

function isPaletteVisible() {
  if (!isAlive(paletteHandle)) return false;
  return typeof paletteHandle.isVisible === "function" ? paletteHandle.isVisible() : true;
}

function postPaletteState() {
  if (!isAlive(paletteHandle)) return;
  if (typeof paletteHandle.postMessage === "function") {
    paletteHandle.postMessage({ type: "state", mode: currentMode, options: currentOptions, overlayVisible });
  }
}

function keepPaletteAboveOverlay() {
  if (!isAlive(paletteHandle)) return;
  try {
    if (typeof paletteHandle.setVisibleOnAllWorkspaces === "function") paletteHandle.setVisibleOnAllWorkspaces(true);
  } catch {
    /* window stacking hints are best-effort */
  }
  try {
    if (typeof paletteHandle.setAlwaysOnTop === "function") paletteHandle.setAlwaysOnTop(true, PALETTE_LEVEL);
  } catch {
    /* window stacking hints are best-effort */
  }
  try {
    if (typeof paletteHandle.moveTop === "function") paletteHandle.moveTop();
  } catch {
    /* window stacking hints are best-effort */
  }
  try {
    if (typeof paletteHandle.show === "function") paletteHandle.show();
  } catch {
    /* window stacking hints are best-effort */
  }
  try {
    if (typeof paletteHandle.focus === "function") paletteHandle.focus();
  } catch {
    /* window stacking hints are best-effort */
  }
}

function overlayPost(ctx, msg) {
  const api = presentation(ctx);
  if (isAlive(overlayHandle) && typeof overlayHandle.postMessage === "function") overlayHandle.postMessage(msg);
  else if (api && typeof api.postMessage === "function") api.postMessage(msg);
}

function setOverlayInteractive(ctx) {
  const on = overlayVisible;
  const api = presentation(ctx);
  if (isAlive(overlayHandle) && typeof overlayHandle.setInteractive === "function") overlayHandle.setInteractive(on);
  else if (api && typeof api.setInteractive === "function") api.setInteractive(on);
}

function registerCanvasHotkeys(ctx) {
  const api = hotkey(ctx);
  if (!api || typeof api.register !== "function" || activeHotkeys.length) return;
  const bindings = [
    ["P", () => isPaletteVisible() && setMode(ctx, "draw")],
    ["E", () => isPaletteVisible() && setMode(ctx, "erase")],
    ["S", () => isPaletteVisible() && setMode(ctx, "spotlight")],
    ["L", () => isPaletteVisible() && setMode(ctx, "line")],
    ["R", () => isPaletteVisible() && setMode(ctx, "rect")],
    ["O", () => isPaletteVisible() && setMode(ctx, "ellipse")],
    ["H", () => isPaletteVisible() && hideOverlay(ctx)],
    ["X", () => isPaletteVisible() && overlayVisible && overlayPost(ctx, { type: "clear" })],
    ["CommandOrControl+Z", () => isPaletteVisible() && overlayVisible && overlayPost(ctx, { type: "undo" })],
  ];
  for (const [accelerator, callback] of bindings) {
    try {
      if (api.register(accelerator, callback)) activeHotkeys.push(accelerator);
    } catch {
      /* dynamic canvas hotkeys are best-effort */
    }
  }
}

function unregisterCanvasHotkeys(ctx) {
  const api = hotkey(ctx);
  if (api && typeof api.unregister === "function") {
    for (const accelerator of activeHotkeys) {
      try {
        api.unregister(accelerator);
      } catch {
        /* ignore cleanup failures */
      }
    }
  }
  activeHotkeys = [];
}

function syncOverlayInteractive(ctx) {
  setOverlayInteractive(ctx);
  if (interactiveTimer) clearTimeout(interactiveTimer);
  interactiveTimer = setTimeout(() => {
    setOverlayInteractive(ctx);
    interactiveTimer = null;
  }, 180);
  interactiveTimer.unref && interactiveTimer.unref();
}

function postOverlayState(ctx) {
  overlayPost(ctx, { type: "state", mode: currentMode, options: currentOptions });
}

function postState(ctx) {
  postPaletteState();
  postOverlayState(ctx);
}

function stopCursorPump() {
  if (cursorTimer) clearInterval(cursorTimer);
  cursorTimer = null;
  lastDown = false;
}

function stopPaletteCloseWatch() {
  if (paletteCloseTimer) clearInterval(paletteCloseTimer);
  paletteCloseTimer = null;
}

function startPaletteCloseWatch(ctx) {
  if (paletteCloseTimer) return;
  paletteCloseTimer = setInterval(() => {
    if (!paletteHandle) {
      stopPaletteCloseWatch();
      return;
    }
    if (isAlive(paletteHandle)) return;
    paletteHandle = null;
    stopPaletteCloseWatch();
    closeOverlay(ctx);
  }, 200);
  paletteCloseTimer.unref && paletteCloseTimer.unref();
}

function normalizePoint(raw) {
  if (!raw || typeof raw !== "object") return null;
  const x = Number(raw.x);
  const y = Number(raw.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x,
    y,
    down: raw.down === true || raw.leftDown === true || raw.buttons === 1,
  };
}

function startCursorPump(ctx) {
  if (cursorTimer) return;
  const api = presentation(ctx);
  if (!api || typeof api.cursorPos !== "function") return;
  cursorTimer = setInterval(() => {
    if (!overlayVisible || DRAWING_MODES.has(currentMode)) return;
    const point = normalizePoint(api.cursorPos());
    if (!point) return;
    overlayPost(ctx, { type: "cursor", point });
    if (point.down && !lastDown) overlayPost(ctx, { type: "click", point });
    lastDown = point.down;
  }, 33);
  cursorTimer.unref && cursorTimer.unref();
}

function onOverlayMessage(ctx, msg) {
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "ready") {
    overlayOpened = true;
    overlayVisible = true;
    syncOverlayInteractive(ctx);
    keepPaletteAboveOverlay();
    postOverlayState(ctx);
    postPaletteState();
  } else if (msg.type === "hotkey") {
    if (!isPaletteVisible()) return;
    if (msg.command === "hide") hideOverlay(ctx);
    else if (msg.command === "clear" && overlayVisible) overlayPost(ctx, { type: "clear" });
    else if (msg.command === "undo" && overlayVisible) overlayPost(ctx, { type: "undo" });
    else if (msg.mode === "spotlight" || DRAWING_MODES.has(msg.mode)) setMode(ctx, msg.mode);
  }
}

function ensureOverlay(ctx) {
  const api = presentation(ctx);
  if (!api || typeof api.openOverlay !== "function") {
    speak(ctx, "강의 도구는 DAP host의 화면 캔버스 지원이 필요해요.");
    return false;
  }
  if (!overlayOpened && !isAlive(overlayHandle)) {
    try {
      overlayHandle = api.openOverlay({
        page: "overlay/index.html",
        width: "screen",
        height: "screen",
        clickThrough: false,
      });
    } catch {
      speak(ctx, "화면 캔버스를 열 수 없어요.");
      return false;
    }
    const messageSource = isAlive(overlayHandle) && typeof overlayHandle.onMessage === "function" ? overlayHandle : api;
    if (messageSource && typeof messageSource.onMessage === "function") {
      disposeOverlayMessages = messageSource.onMessage((msg) => onOverlayMessage(ctx, msg));
    }
  } else if (isAlive(overlayHandle) && typeof overlayHandle.show === "function") {
    overlayHandle.show();
  } else if (typeof api.showOverlay === "function") {
    api.showOverlay();
  }
  overlayOpened = true;
  overlayVisible = true;
  registerCanvasHotkeys(ctx);
  syncOverlayInteractive(ctx);
  startCursorPump(ctx);
  keepPaletteAboveOverlay();
  postState(ctx);
  return true;
}

function hideOverlay(ctx) {
  const api = presentation(ctx);
  if (isAlive(overlayHandle) && typeof overlayHandle.hide === "function") overlayHandle.hide();
  else if (api && typeof api.hideOverlay === "function") api.hideOverlay();
  overlayVisible = false;
  unregisterCanvasHotkeys(ctx);
  setOverlayInteractive(ctx);
  postPaletteState();
}

function closeOverlay(ctx) {
  const api = presentation(ctx);
  if (typeof disposeOverlayMessages === "function") disposeOverlayMessages();
  disposeOverlayMessages = null;
  if (isAlive(overlayHandle) && typeof overlayHandle.close === "function") overlayHandle.close();
  else if (api && typeof api.closeOverlay === "function") api.closeOverlay();
  overlayHandle = null;
  overlayOpened = false;
  overlayVisible = false;
  unregisterCanvasHotkeys(ctx);
  if (interactiveTimer) clearTimeout(interactiveTimer);
  interactiveTimer = null;
  stopCursorPump();
  postPaletteState();
}

function toggleOverlay(ctx) {
  if (overlayVisible) hideOverlay(ctx);
  else ensureOverlay(ctx);
}

function toggleMode(ctx, mode) {
  if (overlayVisible && currentMode === mode) hideOverlay(ctx);
  else setMode(ctx, mode);
}

function setMode(ctx, mode) {
  currentMode = mode;
  if (ensureOverlay(ctx)) {
    syncOverlayInteractive(ctx);
    postState(ctx);
  }
}

function onPaletteMessage(ctx, msg) {
  if (!msg || typeof msg !== "object") return;
  switch (msg.type) {
    case "ready":
      postPaletteState();
      break;
    case "mode":
      if (msg.mode === "spotlight" || DRAWING_MODES.has(msg.mode)) setMode(ctx, msg.mode);
      break;
    case "toggleOverlay":
      toggleOverlay(ctx);
      break;
    case "hideOverlay":
      hideOverlay(ctx);
      break;
    case "clear":
      if (overlayVisible) overlayPost(ctx, { type: "clear" });
      break;
    case "undo":
      if (overlayVisible) overlayPost(ctx, { type: "undo" });
      break;
    case "closePalette":
      unregisterCanvasHotkeys(ctx);
      break;
    case "options":
      mergedOptions(ctx, msg.options);
      ensureOverlay(ctx) && postState(ctx);
      break;
    default:
      break;
  }
}

function openPalette(ctx) {
  const win = windows(ctx);
  if (!win || typeof win.openPalette !== "function") {
    speak(ctx, "강의 도구 팔레트는 DAP host의 window.palette 권한 지원이 필요해요.");
    return false;
  }
  mergedOptions(ctx);
  if (isAlive(paletteHandle)) {
    if (typeof paletteHandle.show === "function") paletteHandle.show();
    if (overlayVisible) registerCanvasHotkeys(ctx);
    postPaletteState();
    return true;
  }
  const vertical = currentOptions.layout === "vertical";
  const paletteOptions = {
    page: "palette/index.html",
    width: vertical ? 74 : 486,
    height: vertical ? 522 : 42,
    frame: false,
    closeOnPetDrop: true,
    alwaysOnTop: true,
    visibleOnAllWorkspaces: true,
    level: PALETTE_LEVEL,
  };
  try {
    paletteHandle = win.openPalette(paletteOptions);
  } catch {
    paletteHandle = win.openPalette({
      page: paletteOptions.page,
      width: paletteOptions.width,
      height: paletteOptions.height,
      frame: paletteOptions.frame,
      closeOnPetDrop: paletteOptions.closeOnPetDrop,
    });
  }
  keepPaletteAboveOverlay();
  if (paletteHandle && typeof paletteHandle.onMessage === "function") {
    paletteHandle.onMessage((msg) => onPaletteMessage(ctx, msg));
  }
  startPaletteCloseWatch(ctx);
  if (overlayVisible) registerCanvasHotkeys(ctx);
  postPaletteState();
  return true;
}

function closePalette() {
  if (isAlive(paletteHandle) && typeof paletteHandle.close === "function") paletteHandle.close();
  paletteHandle = null;
  stopPaletteCloseWatch();
}

function togglePalette(ctx) {
  if (isAlive(paletteHandle) && typeof paletteHandle.isVisible === "function" && paletteHandle.isVisible()) {
    if (typeof paletteHandle.hide === "function") paletteHandle.hide();
    unregisterCanvasHotkeys(ctx);
    return true;
  }
  return openPalette(ctx);
}

export function activate(ctx) {
  ctx.settings.registerSettingsSection({
    sectionId: SETTINGS_LOCAL_ID,
    title: "강의 도구",
    spec: {
      fields: [
        {
          key: "layout",
          label: "팔레트 형태",
          type: "select",
          default: "horizontal",
          options: [
            { value: "horizontal", label: "가로" },
            { value: "vertical", label: "세로" },
          ],
        },
        {
          key: "color",
          label: "펜 색상",
          type: "select",
          default: "#ffcc00",
          options: [
            { value: "#ffcc00", label: "노랑" },
            { value: "#ff4d4f", label: "빨강" },
            { value: "#40c057", label: "초록" },
            { value: "#339af0", label: "파랑" },
          ],
        },
        {
          key: "strokeWidth",
          label: "펜 두께",
          type: "select",
          default: "4",
          options: [
            { value: "3", label: "얇게" },
            { value: "4", label: "보통" },
            { value: "7", label: "굵게" },
          ],
        },
        {
          key: "spotlightSize",
          label: "Spotlight 크기",
          type: "select",
          default: "170",
          options: [
            { value: "120", label: "작게" },
            { value: "170", label: "보통" },
            { value: "240", label: "크게" },
          ],
        },
      ],
    },
  });

  ctx.actions.registerAction({ id: "toggle", callback: () => togglePalette(ctx) });
  ctx.actions.registerAction({ id: "openPalette", callback: () => openPalette(ctx) });
  ctx.actions.registerAction({ id: "drawMode", callback: () => toggleMode(ctx, "draw") });
  ctx.actions.registerAction({ id: "eraseMode", callback: () => toggleMode(ctx, "erase") });
  ctx.actions.registerAction({ id: "spotlightMode", callback: () => toggleMode(ctx, "spotlight") });
  ctx.actions.registerAction({ id: "lineMode", callback: () => toggleMode(ctx, "line") });
  ctx.actions.registerAction({ id: "rectMode", callback: () => toggleMode(ctx, "rect") });
  ctx.actions.registerAction({ id: "ellipseMode", callback: () => toggleMode(ctx, "ellipse") });
  ctx.actions.registerAction({ id: "hideOverlay", callback: () => hideOverlay(ctx) });
  ctx.actions.registerAction({ id: "clear", callback: () => ensureOverlay(ctx) && overlayPost(ctx, { type: "clear" }) });
  ctx.actions.registerAction({ id: "undo", callback: () => ensureOverlay(ctx) && overlayPost(ctx, { type: "undo" }) });

  ctx.commands.addCommand({
    id: "lecture_tools",
    title: "강의 도구",
    matchers: [{ type: "keyword", patterns: ["강의 도구", "판서", "커서 강조", "스포트라이트"], priority: 45 }],
    backend: { type: "builtin", handler: "dap.lecture_tools.toggle" },
  });

  ctx.shortcuts.registerShortcut({
    actionKey: "toggle_lecture_tools",
    title: "강의 도구 켜기/끄기",
    defaultModifiers: MOD_CONTROL | MOD_SHIFT,
    defaultVk: 0x4c,
    actionId: "toggle",
    priority: 80,
  });

  ctx.radialMenu.addItem({ itemId: "lecture", label: "강의 도구", actionId: "toggle", priority: 60, icon: "assets/lecture-tools.svg" });
  ctx.trayMenu.addItem({
    itemId: "lecture",
    label: "강의 도구",
    actionId: "toggle",
    showInContextMenu: true,
    priority: 60,
  });

  return () => {
    closeOverlay(ctx);
    unregisterCanvasHotkeys(ctx);
    closePalette();
  };
}
