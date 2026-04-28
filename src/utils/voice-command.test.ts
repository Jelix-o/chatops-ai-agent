import assert from "node:assert/strict";
import test from "node:test";

import { parseVoiceCommand } from "./voice-command.js";

test("parseVoiceCommand matches #语音 content", () => {
  const result = parseVoiceCommand("#语音 帮我说一句", "", false);

  assert.deepEqual(result, {
    matched: true,
    valid: true,
    userInput: "帮我说一句",
  });
});

test("parseVoiceCommand matches @ bot voice command", () => {
  const result = parseVoiceCommand("", "语音说 帮我总结一下", true);

  assert.deepEqual(result, {
    matched: true,
    valid: true,
    userInput: "帮我总结一下",
  });
});

test("parseVoiceCommand rejects empty body", () => {
  const result = parseVoiceCommand("#语音", "", false);

  assert.equal(result.matched, true);
  assert.equal(result.valid, false);
  assert.match(result.errorMessage ?? "", /语音命令格式/);
});
