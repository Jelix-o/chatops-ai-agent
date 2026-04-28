import type { SkillDefinition } from "../types.js";
import { formatReplyMessages } from "./reply-format.js";

export function buildTtsInputText(
  skill: SkillDefinition,
  replyText: string,
  globalStyleHint?: string,
): string {
  const formattedMessages = formatReplyMessages(skill, replyText);
  const combined = formattedMessages.length > 0 ? formattedMessages.join("，") : replyText;
  const normalized = combined
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s{0,3}(?:[-*•]+|\d+\.)\s+/g, "")
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/__(.*?)__/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/[*_~]/g, "")
        .trim(),
    )
    .filter(Boolean)
    .join("，")
    .replace(/\s+/g, " ")
    .replace(/[，。！？；：,.!?;:]{2,}/g, (match) => match[0] ?? "")
    .trim();

  if (!normalized) {
    return "";
  }

  const mergedStyleHint = [globalStyleHint, skill.ttsStyleHint].filter(Boolean).join(" ").trim();
  return mergedStyleHint ? `<style>${mergedStyleHint}</style>${normalized}` : normalized;
}
