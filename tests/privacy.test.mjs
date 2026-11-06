import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE = /(?:\+\d{1,3}[\s.-])?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}/;
const SECRET = /-----BEGIN [A-Z ]*PRIVATE KEY-----|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|sk_live_[A-Za-z0-9]{10,}/;

const IGNORED_RUNTIME = [".env", "privacy.denylist.local"];
const LOCAL_DENYLIST = path.join(root, "privacy.denylist.local");

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

function parseDenylist(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function readDenylist(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return parseDenylist(fs.readFileSync(filePath, "utf8"));
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
  const forbidden = readDenylist(LOCAL_DENYLIST);
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

test("denylist parsing and matching use an isolated fixture", () => {
  const marker = "zz-local-denylist-marker";
  assert.equal(contains(`prefix ${marker} suffix`, marker), true);
  assert.equal(contains("unrelated", marker), false);
  assert.equal(locationLabel("notes.md", marker), "notes.md");
  assert.equal(locationLabel(`${marker}.txt`, marker), "a tracked path");
  assert.deepEqual(parseDenylist("# comment\n\n  Hidden Phrase  \n\n# tail\n"), ["Hidden Phrase"]);
  assert.deepEqual(parseDenylist(""), []);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "privacy-denylist-"));
  const fixture = path.join(dir, "privacy.denylist.local");
  try {
    fs.writeFileSync(fixture, "# comment\r\n\r\n  Hidden Phrase  \r\n\r\n", "utf8");
    const entries = readDenylist(fixture);
    assert.deepEqual(entries, ["Hidden Phrase"]);
    assert.equal(contains("before Hidden Phrase after", entries[0]), true);
    assert.equal(contains("before hidden phrase after", entries[0]), true);
    assert.equal(contains("unrelated text", entries[0]), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
