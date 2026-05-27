import { readdir } from "node:fs/promises";
import path from "node:path";

import type { SkillDefinition } from "../types.js";
import { readJsonFile } from "../utils/json-file.js";

export class SkillService {
  private cachedSkills?: SkillDefinition[];

  constructor(private readonly skillsDir: string) {}

  async getSkill(skillId: string): Promise<SkillDefinition | undefined> {
    const skills = await this.getAllSkills();
    return skills.find((skill) => skill.id === skillId);
  }

  async getAllSkills(): Promise<SkillDefinition[]> {
    if (this.cachedSkills) {
      return this.cachedSkills;
    }

    const files = await readdir(this.skillsDir, { withFileTypes: true });
    const jsonFiles = files.filter((entry) => entry.isFile() && entry.name.endsWith(".json"));

    const skills = await Promise.all(
      jsonFiles.map(async (entry) => {
        const filePath = path.join(this.skillsDir, entry.name);
        return readJsonFile<SkillDefinition>(filePath);
      }),
    );

    this.cachedSkills = skills.sort((left, right) => left.name.localeCompare(right.name, "zh-Hans-CN"));
    return this.cachedSkills;
  }
}
