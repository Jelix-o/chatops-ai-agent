import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { ConversationTurn, ConversationsFile } from "../types.js";
import { ConversationStore } from "./conversation-store.js";

function makeTurn(groupId: string, userId: string, content: string): ConversationTurn {
  return {
    groupId,
    userId,
    role: "user",
    content,
    timestamp: new Date().toISOString(),
  };
}

async function withTempStore<T>(run: (store: ConversationStore, filePath: string) => Promise<T>): Promise<T> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "conversation-store-test-"));
  const filePath = path.join(tempDir, "conversations.json");

  try {
    return await run(new ConversationStore(filePath), filePath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("stores conversation turns by group and user", async () => {
  await withTempStore(async (store) => {
    await store.appendDialogue("group-1", "user-a", [makeTurn("group-1", "user-a", "A1")], 10);

    assert.equal((await store.getTurns("group-1", "user-a")).length, 1);
    assert.deepEqual(await store.getTurns("group-1", "user-b"), []);
    assert.deepEqual(await store.getTurns("group-2", "user-a"), []);
  });
});

test("clearUser removes only that user's context in a group", async () => {
  await withTempStore(async (store) => {
    await store.appendDialogue("group-1", "user-a", [makeTurn("group-1", "user-a", "A1")], 10);
    await store.appendDialogue("group-1", "user-b", [makeTurn("group-1", "user-b", "B1")], 10);

    await store.clearUser("group-1", "user-a");

    assert.deepEqual(await store.getTurns("group-1", "user-a"), []);
    assert.equal((await store.getTurns("group-1", "user-b")).length, 1);
  });
});

test("clearGroup removes all personal contexts in the group plus legacy group key", async () => {
  await withTempStore(async (store, filePath) => {
    const existing: ConversationsFile = {
      conversations: {
        "group-1": [makeTurn("group-1", "legacy-user", "legacy")],
        "group-1:user-a": [makeTurn("group-1", "user-a", "A1")],
        "group-1:user-b": [makeTurn("group-1", "user-b", "B1")],
        "group-2:user-a": [makeTurn("group-2", "user-a", "other group")],
      },
    };
    await writeFile(filePath, `${JSON.stringify(existing, null, 2)}\n`, "utf8");

    await store.clearGroup("group-1");

    const raw = JSON.parse(await readFile(filePath, "utf8")) as ConversationsFile;
    assert.deepEqual(Object.keys(raw.conversations), ["group-2:user-a"]);
    assert.equal((await store.getTurns("group-2", "user-a")).length, 1);
  });
});

test("missing file, empty shape, and old empty conversations shape normalize safely", async () => {
  await withTempStore(async (store, filePath) => {
    assert.deepEqual(await store.getTurns("group-1", "user-a"), []);

    await writeFile(filePath, "{}", "utf8");
    assert.deepEqual(await store.getTurns("group-1", "user-a"), []);

    await writeFile(filePath, "{\"conversations\":{}}", "utf8");
    assert.deepEqual(await store.getTurns("group-1", "user-a"), []);
  });
});
