import { copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outputDir = path.join(projectDir, "dist");
const manifest = JSON.parse(readFileSync(path.join(projectDir, "manifest.json"), "utf8"));
const files = [
  "manifest.json",
  ...manifest.content_scripts.flatMap((script) => script.js),
  "LICENSE",
  "assets/hugeicons-LICENSE.txt",
];

rmSync(outputDir, { recursive: true, force: true });
for (const file of files) {
  const destination = path.join(outputDir, file);
  mkdirSync(path.dirname(destination), { recursive: true });
  copyFileSync(path.join(projectDir, file), destination);
}

console.log(`Built extension in ${outputDir}`);
