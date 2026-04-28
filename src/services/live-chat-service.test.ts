import assert from "node:assert/strict";
import test from "node:test";

import { LiveChatService } from "./live-chat-service.js";

test("returns the most recently active live chat candidate in the window", () => {
  const service = new LiveChatService();
  const base = Date.parse("2026-04-13T10:00:00.000Z");

  service.addMessage("g1", "u1", "第一句", base + 10_000);
  service.addMessage("g1", "u2", "另一位更晚", base + 20_000);
  service.addMessage("g1", "u1", "第二句", base + 30_000);

  const candidate = service.getWindowCandidate("g1", ["u1", "u2"], base, base + 60_000);

  assert.equal(candidate?.userId, "u1");
  assert.deepEqual(
    candidate?.messages.map((message) => message.text),
    ["第一句", "第二句"],
  );
});

test("detects whether bot has spoken within a time window", () => {
  const service = new LiveChatService();
  const base = Date.parse("2026-04-13T10:00:00.000Z");

  service.recordBotActivity("g1", base + 30_000);

  assert.equal(service.hasBotActivityBetween("g1", base, base + 60_000), true);
  assert.equal(service.hasBotActivityBetween("g1", base + 60_001, base + 120_000), false);
});

test("discardMessagesBefore removes consumed messages from the current window", () => {
  const service = new LiveChatService();
  const base = Date.parse("2026-04-13T10:00:00.000Z");

  service.addMessage("g1", "u1", "第一句", base + 10_000);
  service.addMessage("g1", "u1", "第二句", base + 20_000);
  service.discardMessagesBefore("g1", "u1", base + 20_000);

  const candidate = service.getWindowCandidate("g1", ["u1"], base, base + 60_000);
  assert.equal(candidate, undefined);
});
