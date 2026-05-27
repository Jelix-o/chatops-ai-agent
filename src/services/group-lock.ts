export class GroupLock {
  private readonly states = new Map<string, { active: number; queue: Array<() => void> }>();

  constructor(private readonly maxConcurrentPerGroup = 10) {}

  async run<T>(groupId: string, task: () => Promise<T>): Promise<T> {
    await this.acquire(groupId);
    try {
      return await task();
    } finally {
      this.release(groupId);
    }
  }

  getActiveCount(groupId: string): number {
    return this.states.get(groupId)?.active ?? 0;
  }

  private async acquire(groupId: string): Promise<void> {
    const state = this.getOrCreateState(groupId);
    if (state.active < this.maxConcurrentPerGroup) {
      state.active += 1;
      return;
    }

    await new Promise<void>((resolve) => {
      state.queue.push(() => {
        state.active += 1;
        resolve();
      });
    });
  }

  private release(groupId: string): void {
    const state = this.states.get(groupId);
    if (!state) {
      return;
    }

    state.active = Math.max(0, state.active - 1);
    const next = state.queue.shift();
    if (next) {
      next();
      return;
    }

    if (state.active === 0) {
      this.states.delete(groupId);
    }
  }

  private getOrCreateState(groupId: string): { active: number; queue: Array<() => void> } {
    const existing = this.states.get(groupId);
    if (existing) {
      return existing;
    }

    const state = { active: 0, queue: [] };
    this.states.set(groupId, state);
    return state;
  }
}
