const PLUGIN_ID = "dap.lecture_tools";
const SETTINGS_LOCAL_ID = "general";
const SETTINGS_FULL_ID = `${PLUGIN_ID}.${SETTINGS_LOCAL_ID}`;

const MOD_CONTROL = 0x2;
const MOD_SHIFT = 0x4;

let handle = null;
let currentMode = "cursor";
let currentOptions = {};

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

function withOverlay(ctx, fn) {
  const api = presentation(ctx);
  if (!api) {
    // ponytail: plugin-only shell until the host overlay service lands.
    speak(ctx, "강의 도구는 DAP host의 presentation overlay 업데이트가 필요해요.");
    return false;
  }
  api.setOptions && api.setOptions(mergedOptions(ctx));
  fn(api);
  postState();
  return true;
}

function setMode(ctx, mode) {
  currentMode = mode;
  return withOverlay(ctx, (api) => {
    api.show && api.show();
    api.setMode && api.setMode(mode);
  });
}

function postState() {
  if (!handle || handle.isDestroyed()) return;
  handle.postMessage({ type: "state", mode: currentMode, options: currentOptions });
}

function onPaletteMessage(ctx, msg) {
  if (!msg || typeof msg !== "object") return;
  switch (msg.type) {
    case "ready":
      postState();
      break;
    case "mode":
      if (msg.mode === "cursor" || msg.mode === "draw" || msg.mode === "spotlight") setMode(ctx, msg.mode);
      break;
    case "toggleOverlay":
      withOverlay(ctx, (api) => api.toggle && api.toggle());
      break;
    case "hideOverlay":
      withOverlay(ctx, (api) => api.hide && api.hide());
      break;
    case "clear":
      withOverlay(ctx, (api) => api.clear && api.clear());
      break;
    case "undo":
      withOverlay(ctx, (api) => api.undo && api.undo());
      break;
    case "options":
      withOverlay(ctx, (api) => api.setOptions && api.setOptions(mergedOptions(ctx, msg.options)));
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
  if (handle && !handle.isDestroyed()) {
    handle.show();
    postState();
    return true;
  }
  handle = win.openPalette({ page: "palette/index.html", width: 320, height: 430, frame: false });
  handle.onMessage((msg) => onPaletteMessage(ctx, msg));
  postState();
  return true;
}

function closePalette() {
  if (handle && !handle.isDestroyed()) handle.close();
  handle = null;
}

function togglePalette(ctx) {
  if (handle && !handle.isDestroyed() && handle.isVisible()) {
    handle.hide();
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

  ctx.actions.registerAction({
    id: "toggle",
    callback: () => togglePalette(ctx),
  });
  ctx.actions.registerAction({ id: "openPalette", callback: () => openPalette(ctx) });
  ctx.actions.registerAction({ id: "cursorMode", callback: () => setMode(ctx, "cursor") });
  ctx.actions.registerAction({ id: "drawMode", callback: () => setMode(ctx, "draw") });
  ctx.actions.registerAction({ id: "spotlightMode", callback: () => setMode(ctx, "spotlight") });
  ctx.actions.registerAction({ id: "clear", callback: () => withOverlay(ctx, (api) => api.clear && api.clear()) });
  ctx.actions.registerAction({ id: "undo", callback: () => withOverlay(ctx, (api) => api.undo && api.undo()) });

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
    actionKey: "lecture_draw_mode",
    title: "강의 도구 판서 모드",
    defaultModifiers: MOD_CONTROL | MOD_SHIFT,
    defaultVk: 0x44,
    actionId: "drawMode",
    priority: 81,
  });
  ctx.shortcuts.registerShortcut({
    actionKey: "lecture_spotlight_mode",
    title: "강의 도구 Spotlight 모드",
    defaultModifiers: MOD_CONTROL | MOD_SHIFT,
    defaultVk: 0x53,
    actionId: "spotlightMode",
    priority: 82,
  });

  ctx.radialMenu.addItem({ itemId: "lecture", label: "강의 도구", actionId: "toggle", priority: 60 });
  ctx.trayMenu.addItem({ itemId: "lecture", label: "강의 도구", actionId: "toggle", priority: 60 });

  return () => {
    closePalette();
  };
}
