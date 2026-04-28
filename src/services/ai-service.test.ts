import assert from "node:assert/strict";
import test from "node:test";

import { COMMON_PERSONA_CHAT_RULES } from "../persona/common-chat-behavior.js";
import type { ConversationTurn, SkillDefinition } from "../types.js";
import { buildChatMessages, buildSystemPrompt } from "./ai-service.js";

const skill: SkillDefinition = {
  id: "leijun",
  name: "雷总私聊版",
  systemPrompt: "你是一个更像私聊里回消息的雷军分身",
  styleRules: ["短句", "口语化"],
  knowledge: ["更像聊天，不像演讲"],
  sourceSkillLines: ["# 原始技能", "请严格遵循原始技能内容"],
  exampleExchanges: [
    {
      user: "最近状态不太好",
      assistant: "先别把自己绷太紧，睡够一觉再说",
    },
  ],
  temperature: 0.86,
  maxContextTurns: 12,
};

test("buildSystemPrompt includes target examples", () => {
  const prompt = buildSystemPrompt(skill);

  assert.equal(prompt.includes("Shared group chat behavior:"), true);
  assert.equal(prompt.includes(COMMON_PERSONA_CHAT_RULES[1] ?? ""), true);
  assert.equal(prompt.includes(COMMON_PERSONA_CHAT_RULES[4] ?? ""), true);
  assert.equal(prompt.includes("Target chat examples:"), true);
  assert.equal(prompt.includes("User: 最近状态不太好"), true);
  assert.equal(prompt.includes("Assistant: 先别把自己绷太紧，睡够一觉再说"), true);
  assert.equal(prompt.includes("Original source skill content:"), true);
  assert.equal(prompt.includes("# 原始技能"), true);
});

test("buildChatMessages injects examples before conversation history", () => {
  const history: ConversationTurn[] = [
    {
      groupId: "1",
      role: "user",
      content: "上一轮内容",
      userId: "2",
      timestamp: new Date().toISOString(),
    },
  ];

  const messages = buildChatMessages(skill, history, "这轮问题");

  assert.deepEqual(
    messages.map((message) => message.role),
    ["system", "user", "assistant", "user", "user"],
  );
  assert.equal(messages[1]?.content, "最近状态不太好");
  assert.equal(messages[2]?.content, "先别把自己绷太紧，睡够一觉再说");
  assert.equal(messages.at(-1)?.content, "这轮问题");
});

test("buildChatMessages supports image inputs on current user turn", () => {
  const messages = buildChatMessages(skill, [], "帮我看看这张图", [
    { url: "https://example.com/demo.png" },
  ]);

  const lastMessage = messages.at(-1);
  assert.equal(lastMessage?.role, "user");
  assert.equal(Array.isArray(lastMessage?.content), true);
  const content = lastMessage?.content as Array<{ type: string }>;
  assert.equal(content[0]?.type, "text");
  assert.equal(content[1]?.type, "image_url");
});
