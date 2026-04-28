import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { readJsonFile } from "../utils/json-file.js";

interface HolidayCountdownStoreFile {
  lastSentDateByGroup: Record<string, string>;
}

export class HolidayCountdownStore {
  constructor(private readonly filePath: string) {}

  async getLastSentDate(groupId: string): Promise<string | undefined> {
    const data = await this.readData();
    return data.lastSentDateByGroup[groupId];
  }

  async markSent(groupId: string, dayKey: string): Promise<void> {
    const data = await this.readData();
    data.lastSentDateByGroup[groupId] = dayKey;
    await this.writeData(data);
  }

  private async readData(): Promise<HolidayCountdownStoreFile> {
    try {
      const data = await readJsonFile<HolidayCountdownStoreFile>(this.filePath);
      return {
        lastSentDateByGroup: data.lastSentDateByGroup ?? {},
      };
    } catch (error) {
      const knownError = error as NodeJS.ErrnoException;
      if (knownError.code === "ENOENT") {
        return {
          lastSentDateByGroup: {},
        };
      }
      throw error;
    }
  }

  private async writeData(data: HolidayCountdownStoreFile): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }
}
