export interface BufferedMessage {
  text: string;
  userId: string;
  timestamp: string;
}

export interface LiveChatWindowCandidate {
  groupId: string;
  userId: string;
  messages: BufferedMessage[];
  lastTimestamp: string;
}

const MAX_BUFFER_WINDOW_MS = 30 * 60 * 1000;

export class LiveChatService {
  private readonly buffers = new Map<string, BufferedMessage[]>();
  private readonly botActivities = new Map<string, number[]>();
  private readonly startedAt = Date.now();

  addMessage(groupId: string, userId: string, text: string, now = Date.now()): void {
    const normalized = text.trim();
    if (!normalized) {
      return;
    }

    const key = buildKey(groupId, userId);
    const nextMessages = [
      ...(this.buffers.get(key) ?? []),
      {
        text: normalized,
        userId,
        timestamp: new Date(now).toISOString(),
      },
    ].filter((message) => toTimestamp(message.timestamp) >= now - MAX_BUFFER_WINDOW_MS);

    this.buffers.set(key, nextMessages);
    this.prune(now);
  }

  recordBotActivity(groupId: string, now = Date.now()): void {
    const nextActivities = [
      ...(this.botActivities.get(groupId) ?? []),
      now,
    ].filter((timestamp) => timestamp >= now - MAX_BUFFER_WINDOW_MS);

    this.botActivities.set(groupId, nextActivities);
    this.prune(now);
  }

  hasBotActivityBetween(groupId: string, startTime: number, endTime: number): boolean {
    const activities = this.botActivities.get(groupId) ?? [];
    return activities.some((timestamp) => timestamp >= startTime && timestamp <= endTime);
  }

  getLastBotActivity(groupId: string): number {
    const activities = this.botActivities.get(groupId) ?? [];
    return activities.length > 0 ? activities[activities.length - 1]! : this.startedAt;
  }

  getWindowCandidate(
    groupId: string,
    trackedUserIds: string[],
    startTime: number,
    endTime: number,
  ): LiveChatWindowCandidate | undefined {
    const candidates: LiveChatWindowCandidate[] = [];

    for (const userId of trackedUserIds) {
      const messages = this.getMessagesBetween(groupId, userId, startTime, endTime);
      if (messages.length === 0) {
        continue;
      }

      candidates.push({
        groupId,
        userId,
        messages,
        lastTimestamp: messages[messages.length - 1]!.timestamp,
      });
    }

    candidates.sort((left, right) => toTimestamp(right.lastTimestamp) - toTimestamp(left.lastTimestamp));
    return candidates[0];
  }

  discardMessagesBefore(groupId: string, userId: string, cutoffTime: number): void {
    const key = buildKey(groupId, userId);
    const remaining = (this.buffers.get(key) ?? []).filter(
      (message) => toTimestamp(message.timestamp) > cutoffTime,
    );

    if (remaining.length === 0) {
      this.buffers.delete(key);
      return;
    }

    this.buffers.set(key, remaining);
  }

  private getMessagesBetween(
    groupId: string,
    userId: string,
    startTime: number,
    endTime: number,
  ): BufferedMessage[] {
    const key = buildKey(groupId, userId);
    return (this.buffers.get(key) ?? []).filter((message) => {
      const timestamp = toTimestamp(message.timestamp);
      return timestamp >= startTime && timestamp <= endTime;
    });
  }

  private prune(now: number): void {
    const minimumTime = now - MAX_BUFFER_WINDOW_MS;

    for (const [key, messages] of this.buffers.entries()) {
      const remaining = messages.filter((message) => toTimestamp(message.timestamp) >= minimumTime);
      if (remaining.length === 0) {
        this.buffers.delete(key);
      } else {
        this.buffers.set(key, remaining);
      }
    }

    for (const [groupId, timestamps] of this.botActivities.entries()) {
      const remaining = timestamps.filter((timestamp) => timestamp >= minimumTime);
      if (remaining.length === 0) {
        this.botActivities.delete(groupId);
      } else {
        this.botActivities.set(groupId, remaining);
      }
    }
  }
}

function buildKey(groupId: string, userId: string): string {
  return `${groupId}:${userId}`;
}

function toTimestamp(value: string): number {
  return Date.parse(value);
}
