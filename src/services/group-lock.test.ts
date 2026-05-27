import assert from "node:assert/strict";
import test from "node:test";

import { GroupLock } from "./group-lock.js";

function deferred<T = void>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 50; index += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  assert.equal(predicate(), true);
}

test("GroupLock runs up to ten tasks per group and queues the rest", async () => {
  const lock = new GroupLock(10);
  const releases = Array.from({ length: 11 }, () => deferred());
  let active = 0;
  let maxActive = 0;
  let started = 0;

  const tasks = releases.map((release) =>
    lock.run("67890", async () => {
      started += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      await release.promise;
      active -= 1;
      return started;
    }),
  );

  await waitFor(() => started === 10);
  assert.equal(lock.getActiveCount("67890"), 10);
  assert.equal(maxActive, 10);

  releases[0]?.resolve();
  await waitFor(() => started === 11);

  for (const release of releases.slice(1)) {
    release.resolve();
  }

  await Promise.all(tasks);
  assert.equal(lock.getActiveCount("67890"), 0);
  assert.equal(maxActive, 10);
});

test("GroupLock limits each group independently", async () => {
  const lock = new GroupLock(1);
  const firstGroupRelease = deferred();
  const secondGroupRelease = deferred();
  let started = 0;

  const firstTask = lock.run("67890", async () => {
    started += 1;
    await firstGroupRelease.promise;
  });
  const secondTask = lock.run("866209871", async () => {
    started += 1;
    await secondGroupRelease.promise;
  });

  await waitFor(() => started === 2);
  assert.equal(lock.getActiveCount("67890"), 1);
  assert.equal(lock.getActiveCount("866209871"), 1);

  firstGroupRelease.resolve();
  secondGroupRelease.resolve();
  await Promise.all([firstTask, secondTask]);
});
