import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const readJSON = (file) => JSON.parse(readFileSync(path.join(projectDir, file), "utf8"));
const manifest = readJSON("manifest.json");
const pkg = readJSON("package.json");
if (pkg.version !== manifest.version) {
  throw new Error("package.json and manifest.json versions must match.");
}
const tag = process.env.RELEASE_TAG;
if (tag && tag !== `v${manifest.version}`) {
  throw new Error(`Release tag must be v${manifest.version}; received ${tag}.`);
}

await import("./build.mjs");
const releaseDir = path.join(projectDir, "release");
mkdirSync(releaseDir, { recursive: true });
const archive = path.join(releaseDir, "nu-room-finder.zip");
rmSync(archive, { force: true });
execFileSync("zip", ["-X", "-q", "-r", archive, "."], {
  cwd: path.join(projectDir, "dist"),
  stdio: "inherit",
});
console.log(`Packaged extension in ${archive}`);
