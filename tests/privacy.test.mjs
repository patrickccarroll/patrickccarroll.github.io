import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE = /(?:\+\d{1,3}[\s.-])?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}/;
const SECRET = /-----BEGIN [A-Z ]*PRIVATE KEY-----|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|sk_live_[A-Za-z0-9]{10,}/;

const IGNORED_RUNTIME = ["site.config.js", ".env", "privacy.denylist.local"];

function git(args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function trackedFiles() {
  const out = git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"]);
  if (!out) return [];
  return out.split("\0").filter(Boolean);
}

function originOwner() {
  let url = "";
  try {
    url = git(["remote", "get-url", "origin"]);
  } catch {
    return null;
  }
  const noCreds = url.replace(/^[a-z]+:\/\/[^/]*@/i, "https://");
  const match = noCreds.match(/github\.com[:/]([^/]+)\//i);
  if (!match) return null;
  const owner = decodeURIComponent(match[1]);
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{1,37}[A-Za-z0-9])?$/.test(owner)) return null;
  return owner;
}

function contains(haystack, needle) {
  if (!needle) return false;
  return haystack.toLowerCase().includes(String(needle).toLowerCase());
}

function locationLabel(rel, needle) {
  if (needle && contains(rel, needle)) return "a tracked path";
  return rel;
}

function denylistEntries() {
  const denylist = path.join(root, "privacy.denylist.local");
  if (!fs.existsSync(denylist)) return [];
  return fs
    .readFileSync(denylist, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

test("private runtime paths are ignored and untracked", () => {
  const tracked = new Set(trackedFiles());
  for (const rel of IGNORED_RUNTIME) {
    assert.equal(tracked.has(rel), false, `${rel} is tracked`);
    git(["check-ignore", "-q", "--", rel]);
  }
});

test("tracked files exclude contact details, secrets, and account identity", () => {
  const owner = originOwner();
  const forbidden = denylistEntries();
  const files = trackedFiles();
  assert.ok(files.length > 0, "expected tracked files");

  for (const rel of files) {
    const abs = path.join(root, rel);
    if (!fs.statSync(abs).isFile()) continue;
    const text = fs.readFileSync(abs, "utf8");
    assert.equal(EMAIL.test(text), false, `email-like pattern in ${locationLabel(rel)}`);
    assert.equal(PHONE.test(text), false, `phone-like pattern in ${locationLabel(rel)}`);
    assert.equal(SECRET.test(text), false, `secret-like pattern in ${locationLabel(rel)}`);
    assert.equal(
      contains(text, owner) || contains(rel, owner),
      false,
      `account identifier from the origin remote appears in ${locationLabel(rel, owner)}`
    );
    if (owner) {
      assert.equal(
        contains(text, `${owner}.github.io`),
        false,
        `pages hostname appears in ${locationLabel(rel, owner)}`
      );
    }
    for (const entry of forbidden) {
      assert.equal(
        contains(text, entry) || contains(rel, entry),
        false,
        `local denylist entry appears in ${locationLabel(rel, entry)}`
      );
    }
  }
});

test("denylist matching does not require the forbidden string in the assertion", () => {
  const marker = "zz-local-denylist-marker";
  assert.equal(contains("prefix " + marker + " suffix", marker), true);
  assert.equal(contains("unrelated", marker), false);
  assert.equal(locationLabel("notes.md", marker), "notes.md");
  assert.equal(locationLabel("zz-local-denylist-marker.txt", marker), "a tracked path");
});

test("optional local denylist and runtime config stay untracked", () => {
  const denylist = path.join(root, "privacy.denylist.local");
  const localConfig = path.join(root, "site.config.js");
  assert.equal(fs.existsSync(denylist), false, "denylist should not be created in the repository");
  assert.equal(fs.existsSync(localConfig), false, "runtime config should not be created in the repository");

  fs.writeFileSync(denylist, "Example Site\n", "utf8");
  const denylistHit = trackedFiles().some((rel) => {
    const text = fs.readFileSync(path.join(root, rel), "utf8");
    return denylistEntries().some((entry) => contains(text, entry) || contains(rel, entry));
  });
  assert.equal(denylistHit, true, "expected the local denylist scanner to notice a known placeholder");

  fs.writeFileSync(denylist, "# comment\n\nzz-local-denylist-marker\n", "utf8");
  fs.writeFileSync(
    localConfig,
    "window.SITE_CONFIG = { title: 'Local Example', bio: 'Local fictional override.' };\n",
    "utf8"
  );
  try {
    git(["check-ignore", "-q", "--", "privacy.denylist.local"]);
    git(["check-ignore", "-q", "--", "site.config.js"]);
    assert.equal(git(["status", "--short", "--", "privacy.denylist.local", "site.config.js"]), "");
    assert.equal(trackedFiles().includes("site.config.js"), false);
    assert.equal(trackedFiles().includes("privacy.denylist.local"), false);
  } finally {
    fs.rmSync(denylist, { force: true });
    fs.rmSync(localConfig, { force: true });
  }
});

test("placeholder page and example config stay generic", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const example = fs.readFileSync(path.join(root, "site.config.example.js"), "utf8");
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");

  assert.match(html, /fictional placeholder/i);
  assert.match(html, /id="site-title"/);
  assert.match(html, /id="site-bio"/);
  assert.match(example, /Alex Example/);
  assert.match(example, /fictional/i);
  assert.match(readme, /site\.config\.js/);
  assert.doesNotMatch(html, EMAIL);
  assert.doesNotMatch(example, EMAIL);
  assert.doesNotMatch(readme, EMAIL);
});
