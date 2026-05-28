import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { GroupsConfigFile } from "../types.js";
import { GroupConfigService } from "./group-config-service.js";

async function withService<T>(data: GroupsConfigFile, run: (service: GroupConfigService) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "group-config-service-"));
  const filePath = path.join(dir, "groups.json");

  try {
    await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    return await run(new GroupConfigService(filePath));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("group config defaults and normalizes blacklisted user ids", async () => {
  await withService(
    {
      groups: [
        {
          groupId: "67890",
          currentSkillId: "assistant",
          allowedSkillIds: ["assistant"],
          switcherUserIds: [],
          liveChatUserIds: [],
          blacklistedUserIds: ["20001", "bad", "20001", " 20002 "],
        },
        {
          groupId: "67891",
          currentSkillId: "assistant",
          allowedSkillIds: ["assistant"],
          switcherUserIds: [],
          liveChatUserIds: [],
        },
      ],
    },
    async (service) => {
      assert.deepEqual((await service.getGroup("67890"))?.blacklistedUserIds, ["20001", "20002"]);
      assert.deepEqual((await service.getGroup("67891"))?.blacklistedUserIds, []);
    },
  );
});

test("group config adds and removes blacklisted users", async () => {
  await withService(
    {
      groups: [
        {
          groupId: "67890",
          currentSkillId: "assistant",
          allowedSkillIds: ["assistant"],
          switcherUserIds: [],
          liveChatUserIds: [],
        },
      ],
    },
    async (service) => {
      assert.deepEqual((await service.addBlacklistedUser("67890", "20001")).blacklistedUserIds, ["20001"]);
      assert.deepEqual((await service.addBlacklistedUser("67890", "20001")).blacklistedUserIds, ["20001"]);
      assert.deepEqual((await service.addBlacklistedUser("67890", "20002")).blacklistedUserIds, ["20001", "20002"]);
      assert.deepEqual((await service.removeBlacklistedUser("67890", "20001")).blacklistedUserIds, ["20002"]);
    },
  );
});
