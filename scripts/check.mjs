import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import vm from "node:vm";

const files = [
  "dap_lecture_tools/plugin.mjs",
  "palette/index.html",
  "overlay/index.html",
  "notice/index.html",
];
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const icon = readFileSync(resolve(root, "assets/icon.png"));
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

assert.ok(icon.subarray(0, 8).equals(pngSignature), "assets/icon.png must be a PNG image");
assert.equal(icon.readUInt32BE(16), 512, "assets/icon.png width must be 512");
assert.equal(icon.readUInt32BE(20), 512, "assets/icon.png height must be 512");
assert.equal(icon[25], 6, "assets/icon.png must use RGBA color");
assert.ok(icon.length <= 512 * 1024, "assets/icon.png exceeds 512 KiB");

const manifest = readFileSync(resolve(root, "plugin.yaml"), "utf8");
assert.match(manifest, /^version: 0\.3\.38$/mu);

const entry = readFileSync(resolve(root, "dap_lecture_tools/plugin.mjs"), "utf8");
assert.match(entry, /icon:\s*"assets\/icon\.png"/u, "radial menu must use assets/icon.png");

function checkJavaScript(source, label) {
  new vm.Script(source, { filename: label });
}

function scriptsFromHtml(source) {
  return [...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
}

for (const file of files) {
  const source = readFileSync(file, "utf8");
  if (file.endsWith(".html")) {
    const scripts = scriptsFromHtml(source);
    scripts.forEach((script, index) => checkJavaScript(script, `${file}#script-${index + 1}`));
  } else {
    await import(pathToFileURL(fileURLToPath(new URL(`../${file}`, import.meta.url))).href);
  }
  console.log(`ok ${file}`);
}
