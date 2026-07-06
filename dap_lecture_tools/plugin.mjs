const PLUGIN_ID = "dap.lecture_tools";
const SETTINGS_LOCAL_ID = "general";
const SETTINGS_FULL_ID = `${PLUGIN_ID}.${SETTINGS_LOCAL_ID}`;

const MOD_CONTROL = 0x2;
const MOD_SHIFT = 0x4;

let paletteHandle = null;
let overlayHandle = null;
let overlayOpened = false;
let overlayVisible = false;
let disposeOverlayMessages = null;
let cursorTimer = null;
let lastDown = false;
let currentMode = "cursor";
let currentOptions = {};
let interactiveTimer = null;

const DRAWING_MODES = new Set(["draw", "line", "rect", "ellipse"]);

function presentation(ctx) {
  return ctx.host && ctx.host.presentation;
}

function windows(ctx) {
  return ctx.host && ctx.host.windows;
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
  const spotlightSize = Number.parseInt(String(values.spotlightSize || "220"), 10);
  return {
    cursorHighlight: values.cursorHighlight !== false,
    clickRipple: values.clickRipple !== false,
    color,
    strokeWidth: Number.isFinite(strokeWidth) ? strokeWidth : 4,
    spotlightSize: Number.isFinite(spotlightSize) ? spotlightSize : 220,
    spotlightDim: 0.55,
  };
}

function mergedOptions(ctx, patch) {
  currentOptions = { ...optionsFromSettings(settings(ctx)), ...currentOptions, ...(patch || {}) };
  return currentOptions;
}

function isAlive(handle) {
  return !!handle && !(typeof handle.isDestroyed === "function" && handle.isDestroyed());
}

function postPaletteState() {
  if (!isAlive(paletteHandle)) return;
  if (typeof paletteHandle.postMessage === "function") {
    paletteHandle.postMessage({ type: "state", mode: currentMode, options: currentOptions, overlayVisible });
  }
}

function overlayPost(ctx, msg) {
  const api = presentation(ctx);
  if (isAlive(overlayHandle) && typeof overlayHandle.postMessage === "function") overlayHandle.postMessage(msg);
  else if (api && typeof api.postMessage === "function") api.postMessage(msg);
}

function setOverlayInteractive(ctx) {
  const on = DRAWING_MODES.has(currentMode);
  const api = presentation(ctx);
  if (isAlive(overlayHandle) && typeof overlayHandle.setInteractive === "function") overlayHandle.setInteractive(on);
  else if (api && typeof api.setInteractive === "function") api.setInteractive(on);
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
    postOverlayState(ctx);
    postPaletteState();
  }
}

function ensureOverlay(ctx) {
  const api = presentation(ctx);
  if (!api || typeof api.openOverlay !== "function") {
    speak(ctx, "강의 도구는 DAP host의 presentation overlay 업데이트가 필요해요.");
    return false;
  }
  if (!overlayOpened && !isAlive(overlayHandle)) {
    try {
      overlayHandle = api.openOverlay({
        page: "overlay/index.html",
        width: "screen",
        height: "screen",
        clickThrough: true,
      });
    } catch {
      speak(ctx, "강의 오버레이를 열 수 없어요.");
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
  syncOverlayInteractive(ctx);
  startCursorPump(ctx);
  postState(ctx);
  return true;
}

function hideOverlay(ctx) {
  const api = presentation(ctx);
  if (isAlive(overlayHandle) && typeof overlayHandle.hide === "function") overlayHandle.hide();
  else if (api && typeof api.hideOverlay === "function") api.hideOverlay();
  overlayVisible = false;
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
      if (msg.mode === "cursor" || msg.mode === "spotlight" || DRAWING_MODES.has(msg.mode)) setMode(ctx, msg.mode);
      break;
    case "toggleOverlay":
      toggleOverlay(ctx);
      break;
    case "hideOverlay":
      hideOverlay(ctx);
      break;
    case "clear":
      ensureOverlay(ctx) && overlayPost(ctx, { type: "clear" });
      break;
    case "undo":
      ensureOverlay(ctx) && overlayPost(ctx, { type: "undo" });
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
    postPaletteState();
    return true;
  }
  paletteHandle = win.openPalette({ page: "palette/index.html", width: 748, height: 84, frame: false });
  if (paletteHandle && typeof paletteHandle.onMessage === "function") {
    paletteHandle.onMessage((msg) => onPaletteMessage(ctx, msg));
  }
  postPaletteState();
  return true;
}

function closePalette() {
  if (isAlive(paletteHandle) && typeof paletteHandle.close === "function") paletteHandle.close();
  paletteHandle = null;
}

function togglePalette(ctx) {
  if (isAlive(paletteHandle) && typeof paletteHandle.isVisible === "function" && paletteHandle.isVisible()) {
    if (typeof paletteHandle.hide === "function") paletteHandle.hide();
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
        { key: "cursorHighlight", label: "커서 강조", type: "toggle", default: true },
        { key: "clickRipple", label: "클릭 표시", type: "toggle", default: true },
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
          default: "220",
          options: [
            { value: "160", label: "작게" },
            { value: "220", label: "보통" },
            { value: "320", label: "크게" },
          ],
        },
      ],
    },
  });

  ctx.actions.registerAction({ id: "toggle", callback: () => togglePalette(ctx) });
  ctx.actions.registerAction({ id: "openPalette", callback: () => openPalette(ctx) });
  ctx.actions.registerAction({ id: "cursorMode", callback: () => setMode(ctx, "cursor") });
  ctx.actions.registerAction({ id: "drawMode", callback: () => toggleMode(ctx, "draw") });
  ctx.actions.registerAction({ id: "spotlightMode", callback: () => setMode(ctx, "spotlight") });
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
  ctx.shortcuts.registerShortcut({
    actionKey: "lecture_cursor_mode",
    title: "강의 도구 커서 강조",
    defaultModifiers: MOD_CONTROL | MOD_SHIFT,
    defaultVk: 0x43,
    actionId: "cursorMode",
    priority: 81,
  });
  ctx.shortcuts.registerShortcut({
    actionKey: "lecture_draw_mode",
    title: "강의 도구 펜 켜기/끄기",
    defaultModifiers: MOD_CONTROL | MOD_SHIFT,
    defaultVk: 0x44,
    actionId: "drawMode",
    priority: 82,
  });
  ctx.shortcuts.registerShortcut({
    actionKey: "lecture_spotlight_mode",
    title: "강의 도구 Spotlight 모드",
    defaultModifiers: MOD_CONTROL | MOD_SHIFT,
    defaultVk: 0x53,
    actionId: "spotlightMode",
    priority: 83,
  });
  ctx.shortcuts.registerShortcut({
    actionKey: "lecture_line_mode",
    title: "강의 도구 선 그리기",
    defaultModifiers: MOD_CONTROL | MOD_SHIFT,
    defaultVk: 0x49,
    actionId: "lineMode",
    priority: 84,
  });
  ctx.shortcuts.registerShortcut({
    actionKey: "lecture_rect_mode",
    title: "강의 도구 사각형 그리기",
    defaultModifiers: MOD_CONTROL | MOD_SHIFT,
    defaultVk: 0x52,
    actionId: "rectMode",
    priority: 85,
  });
  ctx.shortcuts.registerShortcut({
    actionKey: "lecture_ellipse_mode",
    title: "강의 도구 원 그리기",
    defaultModifiers: MOD_CONTROL | MOD_SHIFT,
    defaultVk: 0x4f,
    actionId: "ellipseMode",
    priority: 86,
  });
  ctx.shortcuts.registerShortcut({
    actionKey: "lecture_undo",
    title: "강의 도구 되돌리기",
    defaultModifiers: MOD_CONTROL | MOD_SHIFT,
    defaultVk: 0x5a,
    actionId: "undo",
    priority: 87,
  });
  ctx.shortcuts.registerShortcut({
    actionKey: "lecture_clear",
    title: "강의 도구 모두 지우기",
    defaultModifiers: MOD_CONTROL | MOD_SHIFT,
    defaultVk: 0x58,
    actionId: "clear",
    priority: 88,
  });
  ctx.shortcuts.registerShortcut({
    actionKey: "lecture_hide_overlay",
    title: "강의 도구 오버레이 숨기기",
    defaultModifiers: MOD_CONTROL | MOD_SHIFT,
    defaultVk: 0x48,
    actionId: "hideOverlay",
    priority: 89,
  });

  ctx.radialMenu.addItem({ itemId: "lecture", label: "강의 도구", actionId: "toggle", priority: 60 });
  ctx.trayMenu.addItem({ itemId: "lecture", label: "강의 도구", actionId: "toggle", priority: 60 });

  return () => {
    closeOverlay(ctx);
    closePalette();
  };
}
