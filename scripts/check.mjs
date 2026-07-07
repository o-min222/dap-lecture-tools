import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const files = [
  "dap_lecture_tools/plugin.mjs",
  "palette/index.html",
  "overlay/index.html",
];

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
    await import(fileURLToPath(new URL(`../${file}`, import.meta.url)));
  }
  console.log(`ok ${file}`);
}
