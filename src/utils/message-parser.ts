import type { MessageImageInput, MessageSegment } from "../types.js";

export interface ParsedGroupMessage {
  hasAtBot: boolean;
  text: string;
  images: MessageImageInput[];
  mentionUserIds: string[];
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function extractTextFromMessage(message: MessageSegment[] | string): string {
  if (typeof message === "string") {
    return normalizeText(message);
  }

  const parts: string[] = [];
  for (const segment of message) {
    if (typeof segment === "string") {
      parts.push(segment);
      continue;
    }

    if (segment.type === "text") {
      parts.push(segment.data?.text ?? "");
    }
  }

  return normalizeText(parts.join(" "));
}

function extractImageUrl(segment: Exclude<MessageSegment, string>): string | undefined {
  if (segment.type !== "image") {
    return undefined;
  }

  const url = segment.data?.url?.trim();
  if (url) {
    return url;
  }

  const file = segment.data?.file?.trim();
  if (file && /^https?:\/\//i.test(file)) {
    return file;
  }

  return undefined;
}

function extractImageInput(segment: Exclude<MessageSegment, string>): MessageImageInput | undefined {
  if (segment.type !== "image") {
    return undefined;
  }

  const url = extractImageUrl(segment);
  const file = segment.data?.file?.trim();
  const summary = segment.data?.summary?.trim();

  if (!url && !file) {
    return undefined;
  }

  return {
    url,
    file,
    summary,
  };
}

export function parseGroupMessage(
  message: MessageSegment[] | string,
  botQq: string,
): ParsedGroupMessage {
  if (typeof message === "string") {
    const text = normalizeText(message);
    const escapedQq = escapeRegex(botQq);
    const cqAtPattern = new RegExp(`\\[CQ:at,qq=${escapedQq}(?:,[^\\]]*)?\\]`, "gi");
    const plainAtPattern = new RegExp(`(^|\\s)@${escapedQq}\\b`, "g");
    const hasAtBot = cqAtPattern.test(text) || plainAtPattern.test(text);

    return {
      hasAtBot,
      text: normalizeText(text.replace(cqAtPattern, " ").replace(plainAtPattern, " ")),
      images: [],
      mentionUserIds: extractMentionCandidatesFromText(text, botQq),
    };
  }

  let hasAtBot = false;
  const parts: string[] = [];
  const images: MessageImageInput[] = [];
  const mentionUserIds: string[] = [];

  for (const segment of message) {
    if (typeof segment === "string") {
      parts.push(segment);
      continue;
    }

    if (segment.type === "at") {
      const targetQq = String(segment.data?.qq ?? "").trim();
      if (targetQq === botQq) {
        hasAtBot = true;
      } else if (targetQq) {
        mentionUserIds.push(targetQq);
        parts.push(`@${targetQq}`);
      }
      continue;
    }

    if (segment.type === "text") {
      parts.push(segment.data?.text ?? "");
      continue;
    }

    const imageInput = extractImageInput(segment);
    if (imageInput) {
      images.push(imageInput);
    }
  }

  return {
    hasAtBot,
    text: normalizeText(parts.join(" ")),
    images,
    mentionUserIds: mergeMentionUserIds(
      mentionUserIds,
      extractMentionCandidatesFromText(parts.join(" "), botQq),
    ),
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractMentionCandidatesFromText(text: string, botQq: string): string[] {
  const candidates = new Set<string>();
  const qqNumberPattern = /(?<!\d)(\d{5,12})(?!\d)/g;
  const plainAtPattern = /(^|[\s，,。！？!；;、])@([^\s@，,。！？!；;、()[\]{}<>《》"'`]+)/g;

  for (const match of text.matchAll(qqNumberPattern)) {
    const qq = match[1]?.trim();
    if (qq && qq !== botQq) {
      candidates.add(qq);
    }
  }

  for (const match of text.matchAll(plainAtPattern)) {
    const candidate = match[2]?.trim();
    if (!candidate || candidate === botQq) {
      continue;
    }

    candidates.add(candidate);
  }

  return [...candidates];
}

function mergeMentionUserIds(left: string[], right: string[]): string[] {
  return [...new Set([...left, ...right])];
}
