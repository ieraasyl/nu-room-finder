const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");

const projectDir = path.join(__dirname, "..");
const manifest = JSON.parse(readFileSync(path.join(projectDir, "manifest.json"), "utf8"));
const expected = [
  "manifest.json",
  ...manifest.content_scripts.flatMap((script) => script.js),
  "LICENSE",
  "assets/hugeicons-LICENSE.txt",
].sort();

function setupProject(t) {
  const fixture = mkdtempSync(path.join(tmpdir(), "nu-room-finder-"));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  for (const file of [...expected, "package.json", "scripts/build.mjs", "scripts/package.mjs"]) {
    const destination = path.join(fixture, file);
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(path.join(projectDir, file), destination);
  }
  for (const file of ["src/.env", "src/debug.js", "assets/notes.txt", "dist/stale.js"]) {
    const destination = path.join(fixture, file);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, "Local scratch file");
  }
  return fixture;
}

test("build packages the manifest, content scripts, and licenses without local files or stale output", (t) => {
  const fixture = setupProject(t);
  // This fixture has no node_modules or package manager installation.
  execFileSync(process.execPath, [path.join(fixture, "scripts/build.mjs")], { cwd: fixture });
  const outputDir = path.join(fixture, "dist");
  const actual = readdirSync(outputDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(outputDir, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"))
    .sort();
  assert.deepEqual(actual, expected);
  for (const file of expected) {
    assert.deepEqual(readFileSync(path.join(outputDir, file)), readFileSync(path.join(projectDir, file)), file);
  }
});

test("release ZIP can be loaded from its root and excludes local files and old archive contents", (t) => {
  const fixture = setupProject(t);
  const archive = path.join(fixture, "release", "nu-room-finder.zip");
  mkdirSync(path.dirname(archive), { recursive: true });
  writeFileSync(archive, "Old archive contents");
  execFileSync(process.execPath, [path.join(fixture, "scripts/package.mjs")], {
    cwd: fixture,
    env: { ...process.env, RELEASE_TAG: `v${manifest.version}` },
  });
  const files = execFileSync("unzip", ["-Z1", archive], { encoding: "utf8" })
    .trim().split("\n").filter((file) => !file.endsWith("/"))
    .map((file) => file.replace(/^\.\//, "")).sort();
  assert.deepEqual(files, expected);
  assert.equal(existsSync(path.join(fixture, "nu-room-finder.zip")), false);
  for (const file of expected) {
    const contents = execFileSync("unzip", ["-p", archive, file]);
    assert.deepEqual(contents, readFileSync(path.join(projectDir, file)), file);
  }
});

test("packaging rejects a release tag that does not match the extension version", (t) => {
  const fixture = setupProject(t);
  const result = spawnSync(process.execPath, [path.join(fixture, "scripts/package.mjs")], {
    cwd: fixture,
    env: { ...process.env, RELEASE_TAG: "v0.0.0" },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Release tag must be/);
  assert.equal(existsSync(path.join(fixture, "release", "nu-room-finder.zip")), false);
});

test("packaging rejects mismatched package and manifest versions", (t) => {
  const fixture = setupProject(t);
  const pkgPath = path.join(fixture, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  pkg.version = "0.0.0";
  writeFileSync(pkgPath, JSON.stringify(pkg));
  const result = spawnSync(process.execPath, [path.join(fixture, "scripts/package.mjs")], {
    cwd: fixture,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /versions must match/);
  assert.equal(existsSync(path.join(fixture, "release", "nu-room-finder.zip")), false);
});

test("package and extension versions match", () => {
  const pkg = JSON.parse(readFileSync(path.join(projectDir, "package.json"), "utf8"));
  assert.equal(pkg.version, manifest.version);
});
