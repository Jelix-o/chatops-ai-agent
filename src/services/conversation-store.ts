import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ConversationTurn, ConversationsFile } from "../types.js";
import { readJsonFile } from "../utils/json-file.js";

export class ConversationStore {
  constructor(private readonly filePath: string) {}

  async getTurns(groupId: string): Promise<ConversationTurn[]> {
    const data = await this.readData();
    return data.conversations[groupId] ?? [];
  }

  async appendTurn(groupId: string, turn: ConversationTurn, maxTurns: number): Promise<void> {
    const data = await this.readData();
    const turns = data.conversations[groupId] ?? [];
    const nextTurns = [...turns, turn].slice(-maxTurns);
    data.conversations[groupId] = nextTurns;
    await this.writeData(data);
  }

  async appendDialogue(
    groupId: string,
    turns: ConversationTurn[],
    maxTurns: number,
  ): Promise<void> {
    const data = await this.readData();
    const existingTurns = data.conversations[groupId] ?? [];
    data.conversations[groupId] = [...existingTurns, ...turns].slice(-maxTurns);
    await this.writeData(data);
  }

  async clearGroup(groupId: string): Promise<void> {
    const data = await this.readData();
    delete data.conversations[groupId];
    await this.writeData(data);
  }

  private async readData(): Promise<ConversationsFile> {
    try {
      return await readJsonFile<ConversationsFile>(this.filePath);
    } catch (error) {
      const knownError = error as NodeJS.ErrnoException;
      if (knownError.code === "ENOENT") {
        return { conversations: {} };
      }
      throw error;
    }
  }

  private async writeData(data: ConversationsFile): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }
}
