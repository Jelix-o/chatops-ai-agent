import { loadConfig } from "./config.js";
import { NapCatClient } from "./napcat-client.js";
import { NapCatReverseServer } from "./napcat-reverse-server.js";
import { BotApplication } from "./bot.js";
import { AiService } from "./services/ai-service.js";
import { AdminOperationLogService } from "./services/admin-operation-log-service.js";
import { ConversationStore } from "./services/conversation-store.js";
import { DailyReportService } from "./services/daily-report-service.js";
import { DailyReportStore } from "./services/daily-report-store.js";
import { GroupConfigService } from "./services/group-config-service.js";
import { GroupLock } from "./services/group-lock.js";
import { HolidayCountdownService } from "./services/holiday-countdown-service.js";
import { HolidayCountdownStore } from "./services/holiday-countdown-store.js";
import { LiveChatService } from "./services/live-chat-service.js";
import { ScheduledReminderService } from "./services/scheduled-reminder-service.js";
import { ScheduledReminderStore } from "./services/scheduled-reminder-store.js";
import { SkillService } from "./services/skill-service.js";
import { TtsService } from "./services/tts-service.js";
import { logError, logInfo } from "./logger.js";
import type { NapcatGroupMessageEvent } from "./types.js";
import type { MessageTransport } from "./bot.js";

type NapCatRuntime = MessageTransport & {
  start(): void;
  on(event: "groupMessage", listener: (event: NapcatGroupMessageEvent) => void): unknown;
};

async function main(): Promise<void> {
  const config = loadConfig();
  const aiService = new AiService(config.openAiBaseUrl, config.openAiApiKey, config.openAiModel);
  const napcatRuntime: NapCatRuntime =
    config.napcatMode === "reverse"
      ? new NapCatReverseServer({
          host: config.napcatReverseWsHost,
          port: config.napcatReverseWsPort,
          path: config.napcatReverseWsPath,
          accessToken: config.napcatAccessToken,
        })
      : new NapCatClient({
          wsUrl: config.napcatWsUrl,
          accessToken: config.napcatAccessToken,
        });

  const app = new BotApplication(
    napcatRuntime,
    new GroupConfigService(config.groupsConfigPath),
    new SkillService(config.skillsDir),
    new ConversationStore(config.conversationsPath),
    aiService,
    new TtsService(
      config.ttsBaseUrl,
      config.ttsApiKey,
      config.ttsModel,
      config.ttsVoice,
      config.ttsAudioFormat,
      config.ttsCacheDir,
      config.ttsStyleHint,
    ),
    new DailyReportService(
      new DailyReportStore(config.dailyReportStorePath),
      aiService,
    ),
    new HolidayCountdownService(
      new HolidayCountdownStore(config.holidayCountdownStorePath),
      aiService,
    ),
    new ScheduledReminderService(
      new ScheduledReminderStore(config.scheduledReminderStorePath),
      aiService,
    ),
    new AdminOperationLogService(config.adminOperationLogPath),
    new GroupLock(),
    new LiveChatService(),
    config.botQq,
    config.ttsAllowNapCatAiFallback,
  );

  napcatRuntime.on("groupMessage", async (event) => {
    try {
      await app.handleGroupMessage(event);
    } catch (error) {
      logError("Unhandled group message error.", {
        error: (error as Error).message,
        groupId: event.group_id,
        userId: event.user_id,
      });
    }
  });

  app.start();
  napcatRuntime.start();
  logInfo("NapCat QQ skill bot started.", {
    mode: config.napcatMode,
  });
}

main().catch((error) => {
  logError("Application startup failed.", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
