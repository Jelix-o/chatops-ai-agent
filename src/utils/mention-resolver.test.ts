import assert from "node:assert/strict";
import test from "node:test";

import { resolveMentionTargetsFromMembers } from "./mention-resolver.js";

const members = [
  { user_id: 10001, nickname: "老张", card: "张三" },
  { user_id: 10002, nickname: "小王", card: "项目经理" },
  { user_id: 10003, nickname: "技术支持", card: "" },
];

test("resolves exact qq ids only when they exist in the group", () => {
  assert.deepEqual(resolveMentionTargetsFromMembers(members, ["10001", "99999"]), ["10001"]);
});

test("resolves exact nickname and group card matches", () => {
  assert.deepEqual(resolveMentionTargetsFromMembers(members, ["老张", "项目经理"]), [
    "10001",
    "10002",
  ]);
});

test("supports plain-text @ prefixes and fuzzy unique matching", () => {
  assert.deepEqual(resolveMentionTargetsFromMembers(members, ["@张三", "@技术"]), [
    "10001",
    "10003",
  ]);
});

test("skips ambiguous fuzzy matches", () => {
  const ambiguousMembers = [
    { user_id: 10001, nickname: "小张", card: "" },
    { user_id: 10002, nickname: "老张", card: "" },
  ];

  assert.deepEqual(resolveMentionTargetsFromMembers(ambiguousMembers, ["张"]), []);
});
