export class GroupLock {
  private readonly processingGroups = new Set<string>();

  tryAcquire(groupId: string): boolean {
    if (this.processingGroups.has(groupId)) {
      return false;
    }

    this.processingGroups.add(groupId);
    return true;
  }

  release(groupId: string): void {
    this.processingGroups.delete(groupId);
  }
}

