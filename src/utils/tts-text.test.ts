import assert from "node:assert/strict";
import test from "node:test";

import type { SkillDefinition } from "../types.js";
import { buildTtsInputText } from "./tts-text.js";

const skill: SkillDefinition = {
  id: "leijun",
  name: "雷军",
  systemPrompt: "",
  styleRules: [],
  knowledge: [],
  ttsStyleHint: "热情 真诚",
  temperature: 0.8,
  maxContextTurns: 12,
  stripAsterisks: true,
  stripTerminalPunctuation: true,
};

test("buildTtsInputText applies merged style hints and strips markdown-like symbols", () => {
  const text = buildTtsInputText(skill, "**先说结论**\n- 这事可以做", "低沉 成熟 男声感");

  assert.equal(text.startsWith("<style>低沉 成熟 男声感 热情 真诚</style>"), true);
  assert.equal(text.includes("先说结论"), true);
  assert.equal(text.includes("*"), false);
});
