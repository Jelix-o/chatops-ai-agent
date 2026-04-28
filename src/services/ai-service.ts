import OpenAI from "openai";

import { COMMON_PERSONA_CHAT_RULES } from "../persona/common-chat-behavior.js";
import type { AiReply, ConversationTurn, MessageImageInput, SkillDefinition } from "../types.js";
import type { BufferedMessage } from "./live-chat-service.js";

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export interface DailyReportTopicInsight {
  title: string;
  reason: string;
}

export interface DailyReportUserReasonInsight {
  userId: string;
  reason: string;
}

export interface DailyReportHighlightInsight {
  userId: string;
  reason: string;
}

export interface DailyReportQuoteInsight {
  userId?: string;
  text: string;
  reason?: string;
}

export interface DailyReportInsights {
  topics: DailyReportTopicInsight[];
  topUserReasons: DailyReportUserReasonInsight[];
  highlight?: DailyReportHighlightInsight;
  quote?: DailyReportQuoteInsight;
}

export interface ChatPeriodSummaryInput {
  dateLabel: string;
  periodLabel: string;
  rangeLabel: string;
  totalMessages: number;
  participantCount: number;
  topUsers: Array<{
    userName: string;
    messageCount: number;
  }>;
  sampleMessages: Array<{
    userName: string;
    text: string;
    timestamp: string;
  }>;
}

export class AiService {
  private readonly client: OpenAI;

  constructor(
    baseURL: string,
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new OpenAI({ baseURL, apiKey });
  }

  async generateReply(args: {
    skill: SkillDefinition;
    history: ConversationTurn[];
    userInput: string;
    images?: MessageImageInput[];
  }): Promise<AiReply> {
    const { skill, history, userInput, images = [] } = args;
    const messages = buildChatMessages(skill, history, userInput, images);

    // Some OpenAI-compatible gateways only provide text through stream chunks.
    const streamReply = await this.tryStreamReply(messages, skill.temperature);
    if (streamReply) {
      return {
        text: streamReply.text,
        model: streamReply.model,
        skillId: skill.id,
      };
    }

    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: skill.temperature,
      messages,
    });

    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) {
      throw new Error("AI response was empty in both stream and non-stream modes.");
    }

    return {
      text,
      model: completion.model ?? this.model,
      skillId: skill.id,
    };
  }

  async evaluateReplyDesire(
    skill: SkillDefinition,
    history: ConversationTurn[],
    bufferedMessages: BufferedMessage[],
  ): Promise<"REPLY" | "SKIP"> {
    const systemPrompt = buildReplyDesireSystemPrompt(skill);
    const historyText = history
      .slice(-6)
      .map((turn) => `[${turn.role === "user" ? "群友" : skill.name}] ${turn.content}`)
      .join("\n");

    const messagesText = bufferedMessages
      .map((msg, i) => `${i + 1}. ${msg.text}`)
      .join("\n");

    const userContent = [
      historyText ? `最近群聊上下文：\n${historyText}` : "暂无群聊上下文。",
      `该成员最近发送的 ${bufferedMessages.length} 条消息：\n${messagesText}`,
      "请判断是否有回复欲望，只回复 [REPLY] 或 [SKIP]。",
    ].join("\n\n");

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ];

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0.3,
        messages,
        max_tokens: 10,
      });

      const text = completion.choices[0]?.message?.content?.trim() ?? "";
      if (text.includes("REPLY")) {
        return "REPLY";
      }
      return "SKIP";
    } catch {
      return "SKIP";
    }
  }

  async generateDailyReportInsights(args: {
    dateLabel: string;
    totalMessages: number;
    participantCount: number;
    peakHourLabel: string;
    topUsers: Array<{
      userId: string;
      userName: string;
      messageCount: number;
      sampleMessages: string[];
    }>;
    sampleMessages: Array<{
      userId: string;
      userName: string;
      text: string;
      timestamp: string;
    }>;
  }): Promise<DailyReportInsights | null> {
    const topUsersText = args.topUsers
      .map((user, index) => {
        const samples = user.sampleMessages.map((text) => `- ${text}`).join("\n");
        return [
          `${index + 1}. ${user.userName} (${user.userId})`,
          `发言数: ${user.messageCount}`,
          samples ? `代表发言:\n${samples}` : "",
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n");

    const sampleMessagesText = args.sampleMessages
      .map(
        (message, index) =>
          `${index + 1}. [${message.timestamp.slice(11, 16)}] ${message.userName} (${message.userId}): ${message.text}`,
      )
      .join("\n");

    const messages: ChatMessage[] = [
      {
        role: "system",
        content: [
          "你是QQ群聊日报分析助手",
          "你只能根据我提供的统计和样本发言做总结，不要编造不存在的人和话题",
          "请只输出 JSON，不要输出 markdown 代码块",
          "JSON 格式如下：",
          '{',
          '  "topics": [{"title": "话题名", "reason": "为什么今天会围绕它聊"}],',
          '  "topUserReasons": [{"userId": "QQ号", "reason": "该群友今天为什么能排进前列"}],',
          '  "highlight": {"userId": "QQ号", "reason": "为什么他是今天最高光的人"},',
          '  "quote": {"userId": "QQ号", "text": "一句最有代表性的原话", "reason": "为什么这句有代表性"}',
          "}",
          "要求：",
          "1. topics 最多 3 条",
          "2. topUserReasons 最多 3 条",
          "3. reason 要具体，基于样本内容，不要空话",
          "4. quote.text 必须来自样本发言原文，不能改写",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `日期: ${args.dateLabel}`,
          `消息总数: ${args.totalMessages}`,
          `活跃人数: ${args.participantCount}`,
          `最热时段: ${args.peakHourLabel}`,
          "",
          "发言前列群友：",
          topUsersText || "暂无",
          "",
          "群聊样本：",
          sampleMessagesText || "暂无",
        ].join("\n"),
      },
    ];

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0.4,
        messages,
        max_tokens: 900,
      });

      const text = completion.choices[0]?.message?.content?.trim();
      if (!text) {
        return null;
      }

      return parseDailyReportInsights(text);
    } catch {
      return null;
    }
  }

  async generateBroadcastQuip(
    scene: "holiday_morning" | "daily_report_evening",
  ): Promise<string> {
    const fallback =
      scene === "holiday_morning"
        ? "先把活挂着，别把摸鱼摸成工伤"
        : "班是公司的，命是自己的，别磨蹭";

    const sceneInstruction =
      scene === "holiday_morning"
        ? "场景：工作日早上九点，提醒群友该摸鱼了，语气搞笑、欠一点、像群里熟人开玩笑"
        : "场景：傍晚下班时间，提醒群友赶紧回家，语气搞笑、欠一点、像群里熟人催人撤退";

    const messages: ChatMessage[] = [
      {
        role: "system",
        content: [
          "你是QQ群定时提醒文案助手",
          "只输出一句中文短句",
          "不要超过50个中文字符",
          "不要换行，不要引号，不要emoji，不要解释",
          "语气要幽默、简短、自然，像群友之间互损",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          sceneInstruction,
          "只给我一句成品文案",
        ].join("\n"),
      },
    ];

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0.9,
        messages,
        max_tokens: 80,
      });

      const text = normalizeBroadcastQuip(completion.choices[0]?.message?.content ?? "");
      return text || fallback;
    } catch {
      return fallback;
    }
  }

  async generateChatPeriodSummary(args: ChatPeriodSummaryInput): Promise<string | null> {
    const topUsersText =
      args.topUsers.length > 0
        ? args.topUsers.map((user) => `${user.userName}${user.messageCount}条`).join("、")
        : "暂无明显活跃成员";

    const sampleMessagesText = args.sampleMessages
      .map(
        (message, index) =>
          `${index + 1}. [${message.timestamp.slice(11, 16)}] ${message.userName}: ${message.text}`,
      )
      .join("\n");

    const messages: ChatMessage[] = [
      {
        role: "system",
        content: [
          "你是QQ群时间段聊天总结助手",
          "只能根据我提供的聊天记录和统计信息做总结，不要编造不存在的话题、人物和情绪",
          "输出 3 到 4 行中文纯文本，不要 markdown，不要代码块，不要解释你在分析",
          "第1行固定写：<时间段>聊天总结",
          "第2行写：主要在聊：...",
          "第3行写：比较活跃：...",
          "第4行优先写：典型内容：...，不方便写典型内容时再写：整体感觉：...",
          "第2行必须明确点出1到3个具体话题、事件或关键词，优先复用聊天样本里的原词",
          "不要只写消息数、参与人数、大家在聊天、比较热闹、一直有人接话这类空话",
          "整段尽量控制在180字以内，语言自然，像群里随手帮大家做个总结",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `日期：${args.dateLabel}`,
          `时间段：${args.periodLabel}`,
          `范围：${args.rangeLabel}`,
          `消息数：${args.totalMessages}`,
          `参与人数：${args.participantCount}`,
          `活跃成员：${topUsersText}`,
          "",
          "聊天样本：",
          sampleMessagesText || "暂无",
        ].join("\n"),
      },
    ];

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0.4,
        messages,
        max_tokens: 260,
      });

      const text = completion.choices[0]?.message?.content?.trim();
      return text ? normalizeChatPeriodSummary(text) : null;
    } catch {
      return null;
    }
  }

  private async tryStreamReply(
    messages: ChatMessage[],
    temperature: number,
  ): Promise<{ text: string; model: string } | null> {
    try {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        temperature,
        messages,
        stream: true,
      });

      let text = "";
      let model = this.model;
      for await (const chunk of stream) {
        model = chunk.model ?? model;
        const delta = chunk.choices[0]?.delta?.content;
        if (typeof delta === "string") {
          text += delta;
        }
      }

      const normalized = text.trim();
      if (!normalized) {
        return null;
      }

      return { text: normalized, model };
    } catch {
      return null;
    }
  }
}

export function buildChatMessages(
  skill: SkillDefinition,
  history: ConversationTurn[],
  userInput: string,
  images: MessageImageInput[] = [],
): ChatMessage[] {
  const exampleMessages =
    skill.exampleExchanges?.flatMap((example) => [
      {
        role: "user" as const,
        content: example.user,
      },
      {
        role: "assistant" as const,
        content: example.assistant,
      },
    ]) ?? [];

  const currentUserMessage = buildCurrentUserMessage(userInput, images);

  return [
    {
      role: "system",
      content: buildSystemPrompt(skill),
    },
    ...exampleMessages,
    ...history.map((turn) => ({
      role: turn.role,
      content: turn.content,
    })),
    currentUserMessage,
  ];
}

function buildCurrentUserMessage(
  userInput: string,
  images: MessageImageInput[],
): OpenAI.Chat.Completions.ChatCompletionUserMessageParam {
  const usableImages = images.filter((image) => typeof image.url === "string" && image.url.length > 0);

  if (usableImages.length === 0) {
    return {
      role: "user",
      content: userInput,
    };
  }

  const text = userInput.trim() || "请根据这张图片的内容来理解我的意思并回复";

  return {
    role: "user",
    content: [
      {
        type: "text",
        text,
      },
      ...usableImages.map((image) => ({
        type: "image_url" as const,
        image_url: {
          url: image.url!,
        },
      })),
    ],
  };
}

function parseDailyReportInsights(text: string): DailyReportInsights | null {
  const jsonText = extractJsonObject(text);
  if (!jsonText) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonText) as Partial<DailyReportInsights>;
    const topics = Array.isArray(parsed.topics)
      ? parsed.topics
          .map((item) => ({
            title: typeof item?.title === "string" ? item.title.trim() : "",
            reason: typeof item?.reason === "string" ? item.reason.trim() : "",
          }))
          .filter((item) => item.title && item.reason)
          .slice(0, 3)
      : [];
    const topUserReasons = Array.isArray(parsed.topUserReasons)
      ? parsed.topUserReasons
          .map((item) => ({
            userId: typeof item?.userId === "string" ? item.userId.trim() : "",
            reason: typeof item?.reason === "string" ? item.reason.trim() : "",
          }))
          .filter((item) => item.userId && item.reason)
          .slice(0, 3)
      : [];
    const highlight =
      parsed.highlight &&
      typeof parsed.highlight.userId === "string" &&
      typeof parsed.highlight.reason === "string"
        ? {
            userId: parsed.highlight.userId.trim(),
            reason: parsed.highlight.reason.trim(),
          }
        : undefined;
    const quote =
      parsed.quote && typeof parsed.quote.text === "string"
        ? {
            userId:
              typeof parsed.quote.userId === "string" ? parsed.quote.userId.trim() : undefined,
            text: parsed.quote.text.trim(),
            reason:
              typeof parsed.quote.reason === "string" ? parsed.quote.reason.trim() : undefined,
          }
        : undefined;

    return {
      topics,
      topUserReasons,
      highlight,
      quote: quote?.text ? quote : undefined,
    };
  } catch {
    return null;
  }
}

function extractJsonObject(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced?.[1]?.trim() ?? text.trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return raw.slice(start, end + 1);
}

function normalizeBroadcastQuip(text: string): string {
  return text
    .replace(/\r?\n/g, " ")
    .replace(/["“”'‘’]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50);
}

function normalizeChatPeriodSummary(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/```(?:text)?/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 220);
}

export function buildSystemPrompt(skill: SkillDefinition): string {
  const commonChatBehavior = COMMON_PERSONA_CHAT_RULES.map((rule) => `- ${rule}`).join("\n");
  const style = skill.styleRules.map((rule) => `- ${rule}`).join("\n");
  const knowledge = skill.knowledge.map((item) => `- ${item}`).join("\n");
  const examples =
    skill.exampleExchanges?.length
      ? [
          "",
          "Target chat examples:",
          ...skill.exampleExchanges.flatMap((example, index) => [
            `${index + 1}. User: ${example.user}`,
            `   Assistant: ${example.assistant}`,
          ]),
        ].join("\n")
      : "";
  const sourceSkill =
    skill.sourceSkillLines?.length
      ? [
          "",
          "Original source skill content:",
          ...skill.sourceSkillLines,
        ].join("\n")
      : "";

  return [
    skill.systemPrompt,
    "",
    "Shared group chat behavior:",
    commonChatBehavior,
    "",
    "Response style:",
    style,
    "",
    "Known context:",
    knowledge,
    examples,
    sourceSkill,
  ].join("\n");
}

export function buildReplyDesireSystemPrompt(skill: SkillDefinition): string {
  return [
    `你现在扮演的角色是「${skill.name}」。以下是你的角色设定：`,
    "",
    skill.systemPrompt,
    "",
    "你的任务：判断作为这个角色，看到群成员发的消息后，是否有强烈的回复欲望？",
    "",
    "判断标准：",
    "- 消息内容是否触发了你的性格特征（被挑衅、被嘲讽、被提及、话题与你相关、情绪共鸣等）",
    "- 你的性格是否决定了你会忍不住插嘴、抬杠、吐槽或回应",
    "- 消息内容是否有足够的情感冲击力让你产生反应",
    "",
    "如果消息平淡无奇、与你无关、或者你性格上不太在意这种内容，就选择跳过。",
    "",
    "回复规则：只回复以下两个标签之一，不要回复任何其他内容：",
    "[REPLY] - 有强烈的回复欲望，想插嘴",
    "[SKIP] - 没有回复欲望，不值得回",
  ].join("\n");
}
