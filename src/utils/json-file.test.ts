import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { readJsonFile, stripUtf8Bom } from "./json-file.js";

test("stripUtf8Bom removes leading BOM", () => {
  assert.equal(stripUtf8Bom("\ufeff{\"ok\":true}"), "{\"ok\":true}");
});

test("readJsonFile parses JSON files saved with UTF-8 BOM", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "json-file-test-"));
  const filePath = path.join(tempDir, "sample.json");

  try {
    await writeFile(filePath, "\ufeff{\"groups\":[]}", "utf8");
    const result = await readJsonFile<{ groups: unknown[] }>(filePath);
    assert.deepEqual(result, { groups: [] });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
