// 简单的进程内并发锁，防止同一项目重复触发昂贵的 LLM/扫描任务。
// 单实例 Next.js dev server 够用；多实例部署时需要换成 Redis/DB 锁。

const locks = new Map<string, { type: string; since: number }>();

const MAX_LOCK_AGE_MS = 15 * 60 * 1000; // 兜底：15 分钟后强制释放，防止卡死

export type AcquireResult =
  | { ok: true; release: () => void }
  | { ok: false; type: string; sinceMs: number };

export function acquireProjectLock(projectId: string, type: string): AcquireResult {
  const existing = locks.get(projectId);
  const now = Date.now();
  if (existing && now - existing.since < MAX_LOCK_AGE_MS) {
    return { ok: false, type: existing.type, sinceMs: now - existing.since };
  }
  locks.set(projectId, { type, since: now });
  let released = false;
  return {
    ok: true,
    release() {
      if (released) return;
      released = true;
      locks.delete(projectId);
    },
  };
}

export function peekProjectLock(projectId: string) {
  const existing = locks.get(projectId);
  if (!existing) return null;
  if (Date.now() - existing.since >= MAX_LOCK_AGE_MS) {
    locks.delete(projectId);
    return null;
  }
  return existing;
}
