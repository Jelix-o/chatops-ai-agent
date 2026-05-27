import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ScheduledReminderTask, ScheduledRemindersFile } from "../types.js";
import { readJsonFile } from "../utils/json-file.js";

export class ScheduledReminderStore {
  private cachedData?: ScheduledRemindersFile;

  constructor(private readonly filePath: string) {}

  async addTask(args: {
    groupId: string;
    creatorUserId: string;
    intervalMinutes: number;
    topic: string;
    now?: Date;
  }): Promise<ScheduledReminderTask> {
    const now = args.now ?? new Date();
    const data = await this.readData();
    const task: ScheduledReminderTask = {
      id: createTaskId(now, data.tasks),
      groupId: args.groupId,
      creatorUserId: args.creatorUserId,
      intervalMinutes: args.intervalMinutes,
      topic: normalizeTopic(args.topic),
      createdAt: now.toISOString(),
      nextRunAt: new Date(now.getTime() + args.intervalMinutes * 60 * 1000).toISOString(),
      enabled: true,
      recentMessages: [],
    };

    data.tasks[task.id] = task;
    await this.writeData(data);
    return task;
  }

  async listGroupTasks(groupId: string): Promise<ScheduledReminderTask[]> {
    const data = await this.readData();
    return Object.values(data.tasks)
      .filter((task) => task.groupId === groupId && task.enabled)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async updateTask(
    taskId: string,
    updates: { intervalMinutes?: number; topic?: string; nextRunAt?: string },
  ): Promise<ScheduledReminderTask | undefined> {
    const data = await this.readData();
    const task = data.tasks[taskId];
    if (!task) {
      return undefined;
    }

    const updated: ScheduledReminderTask = {
      ...task,
      ...(updates.intervalMinutes !== undefined && { intervalMinutes: updates.intervalMinutes }),
      ...(updates.topic !== undefined && { topic: normalizeTopic(updates.topic) }),
      ...(updates.nextRunAt !== undefined && { nextRunAt: updates.nextRunAt }),
    };
    data.tasks[taskId] = updated;
    await this.writeData(data);
    return updated;
  }

  async removeGroupTask(groupId: string, taskId: string): Promise<boolean> {
    const data = await this.readData();
    const task = data.tasks[taskId];
    if (!task || task.groupId !== groupId) {
      return false;
    }

    delete data.tasks[taskId];
    await this.writeData(data);
    return true;
  }

  async getDueTasks(now = new Date()): Promise<ScheduledReminderTask[]> {
    const data = await this.readData();
    const nowMs = now.getTime();
    return Object.values(data.tasks)
      .filter((task) => task.enabled && new Date(task.nextRunAt).getTime() <= nowMs)
      .sort((left, right) => left.nextRunAt.localeCompare(right.nextRunAt));
  }

  async markSent(taskId: string, message: string, now = new Date()): Promise<ScheduledReminderTask | undefined> {
    const data = await this.readData();
    const task = data.tasks[taskId];
    if (!task) {
      return undefined;
    }

    const intervalMs = task.intervalMinutes * 60 * 1000;
    const previousNextRunMs = new Date(task.nextRunAt).getTime();
    const baseMs = Number.isFinite(previousNextRunMs) && previousNextRunMs > now.getTime()
      ? previousNextRunMs
      : now.getTime();

    const updated: ScheduledReminderTask = {
      ...task,
      nextRunAt: new Date(baseMs + intervalMs).toISOString(),
      recentMessages: [...(task.recentMessages ?? []), message].slice(-5),
    };
    data.tasks[taskId] = updated;
    await this.writeData(data);
    return updated;
  }

  private async readData(): Promise<ScheduledRemindersFile> {
    if (this.cachedData) {
      return this.cachedData;
    }

    try {
      this.cachedData = normalizeScheduledRemindersFile(
        await readJsonFile<ScheduledRemindersFile>(this.filePath),
      );
      return this.cachedData;
    } catch (error) {
      const knownError = error as NodeJS.ErrnoException;
      if (knownError.code === "ENOENT") {
        this.cachedData = { tasks: {} };
        return this.cachedData;
      }
      throw error;
    }
  }

  private async writeData(data: ScheduledRemindersFile): Promise<void> {
    this.cachedData = data;
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }
}

function normalizeScheduledRemindersFile(data: Partial<ScheduledRemindersFile>): ScheduledRemindersFile {
  if (!data || typeof data.tasks !== "object" || data.tasks === null) {
    return { tasks: {} };
  }

  const tasks: ScheduledRemindersFile["tasks"] = {};
  for (const [taskId, task] of Object.entries(data.tasks)) {
    if (
      task &&
      typeof task === "object" &&
      typeof task.groupId === "string" &&
      typeof task.creatorUserId === "string" &&
      Number.isFinite(task.intervalMinutes) &&
      typeof task.topic === "string" &&
      typeof task.createdAt === "string" &&
      typeof task.nextRunAt === "string"
    ) {
      tasks[taskId] = {
        ...task,
        id: task.id || taskId,
        enabled: task.enabled !== false,
        recentMessages: Array.isArray(task.recentMessages) ? task.recentMessages : [],
      };
    }
  }

  return { tasks };
}

function createTaskId(now: Date, tasks: Record<string, ScheduledReminderTask>): string {
  const base = `rem-${toCompactTimestamp(now)}`;
  let id = base;
  let index = 1;
  while (tasks[id]) {
    index += 1;
    id = `${base}-${index}`;
  }
  return id;
}

function toCompactTimestamp(now: Date): string {
  return [
    now.getFullYear(),
    `${now.getMonth() + 1}`.padStart(2, "0"),
    `${now.getDate()}`.padStart(2, "0"),
    `${now.getHours()}`.padStart(2, "0"),
    `${now.getMinutes()}`.padStart(2, "0"),
    `${now.getSeconds()}`.padStart(2, "0"),
  ].join("");
}

function normalizeTopic(topic: string): string {
  return topic.replace(/\s+/g, " ").trim().slice(0, 80);
}
