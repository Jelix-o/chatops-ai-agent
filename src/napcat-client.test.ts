import test from "node:test";
import assert from "node:assert/strict";

import { NapCatClient } from "./napcat-client.js";

test("falls back to HTTP send_group_msg when websocket is not open", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response("{}", { status: 200 });
  };

  try {
    const client = new NapCatClient({
      wsUrl: "ws://127.0.0.1:3001/onebot/v11/ws",
      accessToken: "secret",
    });

    await client.sendGroupMessage("67890", "hello");

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "http://127.0.0.1:3001/send_group_msg");
    assert.match(String(calls[0]?.init?.body), /67890/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("emits groupMessage for group message events", async () => {
  const client = new NapCatClient({
    wsUrl: "ws://127.0.0.1:3001",
  });

  const eventPromise = new Promise<number>((resolve) => {
    client.once("groupMessage", (event) => resolve(event.group_id));
  });

  (client as any).handleMessage(
    JSON.stringify({
      post_type: "message",
      message_type: "group",
      self_id: 12345,
      group_id: 67890,
      user_id: 10001,
      message_id: 1,
      raw_message: "@bot hi",
      message: [
        { type: "at", data: { qq: "12345" } },
        { type: "text", data: { text: " hi" } },
      ],
    }),
  );

  assert.equal(await eventPromise, 67890);
});

