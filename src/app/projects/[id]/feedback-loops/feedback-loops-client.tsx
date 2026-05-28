"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { DROP_REASON_META } from "@/lib/outreach-feedback";

interface LoopPayload {
  id: string;
  sampleSize: number;
  droppedCount: number;
  reasonDistribution: Record<string, number>;
  funnelSnapshot: Record<string, number>;
  recommendedActions: unknown[];
  assumptionVerdicts: unknown[];
  reportMarkdown: string | null;
  status: string;
  createdAt: string;
  personaVersion: { id: string; version: number; createdAt: string } | null;
}

interface ActionItem {
  target: string;
  code: string;
  description: string;
  clientAlert?: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  pending_review: "待审阅",
  applied: "已采纳",
  dismissed: "已存档",
};

export function FeedbackLoopsClient({
  projectId,
  initialLoops,
  compact = false,
}: {
  projectId: string;
  initialLoops: LoopPayload[];
  compact?: boolean;
}) {
  const [loops, setLoops] = useState<LoopPayload[]>(initialLoops);
  // Initial loading state derived from compact prop so the compact-mode refresh
  // effect doesn't have to call setLoading(true) synchronously in its body —
  // that triggers react-hooks/set-state-in-effect cascading-render warning.
  const [loading, setLoading] = useState(compact);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  useEffect(() => {
    if (!compact) return;
    let cancelled = false;
    fetchLoops(projectId)
      .then((refreshed) => {
        if (!cancelled) setLoops(refreshed);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [compact, projectId]);

  async function triggerNew(force = false) {
    setTriggering(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/feedback-loops/run${force ? "?force=1" : ""}`,
        { method: "POST" },
      );
      const body = (await res.json()) as { loop?: LoopPayload; error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? `请求失败 (${res.status})`);
      }
      if (body.loop) {
        const refreshed = await fetchLoops(projectId);
        setLoops(refreshed);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "触发失败");
    } finally {
      setTriggering(false);
    }
  }

  async function updateStatus(loopId: string, status: "applied" | "dismissed") {
    setUpdatingId(loopId);
    if (status === "applied") setApplyingId(loopId);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/feedback-loops/${loopId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `请求失败 (${res.status})`);
      }
      const refreshed = await fetchLoops(projectId);
      setLoops(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新失败");
    } finally {
      setUpdatingId(null);
      setApplyingId(null);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void triggerNew(false)}
          disabled={triggering}
        >
          {triggering ? "运行中…" : "触发反哺（≥5 流失样本）"}
        </button>
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => void triggerNew(true)}
          disabled={triggering}
          title="忽略样本下限，强制触发（测试用）"
        >
          强制触发
        </button>
      </div>

      {error ? (
        <div className="error-banner" style={{ marginBottom: 12 }}>
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="empty-state" style={{ padding: compact ? 12 : 24, opacity: 0.6 }}>
          正在加载反哺记录…
        </div>
      ) : loops.length === 0 ? (
        <div className="empty-state" style={{ padding: 24, opacity: 0.6 }}>
          尚未生成反哺记录。当 OutreachEvent 记录 ≥ 5 个流失事件时可触发，或点击「强制触发」测试。
        </div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 16 }}>
          {loops.map((loop) => (
            <li
              key={loop.id}
              style={{
                border: "1px solid var(--ha-line)",
                borderRadius: 8,
                padding: 16,
                background: "var(--ha-bg-soft)",
              }}
            >
              <header
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <div>
                  <strong style={{ fontSize: 13 }}>
                    {new Date(loop.createdAt).toLocaleString("zh-CN", { hour12: false })}
                  </strong>
                  <span style={{ marginLeft: 8, opacity: 0.6, fontSize: 11 }}>
                    样本 {loop.sampleSize} / 流失 {loop.droppedCount}
                  </span>
                </div>
                <span
                  className="pill"
                  style={{
                    fontSize: 10,
                    padding: "2px 8px",
                    background:
                      loop.status === "applied"
                        ? "var(--ha-accent)"
                        : loop.status === "dismissed"
                          ? "var(--ha-line)"
                          : "var(--ha-warn, #b8860b)",
                    color: "#fff",
                    borderRadius: 4,
                  }}
                >
                  {STATUS_LABELS[loop.status] ?? loop.status}
                </span>
              </header>

              <ReasonDistribution dist={loop.reasonDistribution} total={loop.droppedCount} />

              <ActionList actions={loop.recommendedActions as ActionItem[]} />

              {loop.reportMarkdown ? (
                <details style={{ marginTop: 12 }}>
                  <summary style={{ cursor: "pointer", fontSize: 11, opacity: 0.7 }}>
                    报告 Markdown
                  </summary>
                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      fontSize: 11,
                      marginTop: 6,
                      padding: 12,
                      background: "var(--ha-bg)",
                      borderRadius: 4,
                    }}
                  >
                    {loop.reportMarkdown}
                  </pre>
                </details>
              ) : null}

              {loop.status === "pending_review" ? (
                <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={updatingId === loop.id}
                    onClick={() => void updateStatus(loop.id, "applied")}
                  >
                    {applyingId === loop.id ? "AI 更新画像中…" : "采纳建议"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={updatingId === loop.id}
                    onClick={() => void updateStatus(loop.id, "dismissed")}
                  >
                    {updatingId === loop.id && applyingId !== loop.id ? "存档中…" : "存档不采纳"}
                  </button>
                  {applyingId === loop.id ? (
                    <span style={{ fontSize: 10, opacity: 0.55 }}>
                      正在调用 LLM 更新画像，约需 10-30 秒…
                    </span>
                  ) : null}
                </div>
              ) : null}
              {loop.personaVersion ? (
                <div style={{ marginTop: 10, fontSize: 11, opacity: 0.7 }}>
                  已生成画像 v{loop.personaVersion.version} ·{" "}
                  {new Date(loop.personaVersion.createdAt).toLocaleString("zh-CN", { hour12: false })}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {compact ? (
        <div style={{ marginTop: 12, fontSize: 11, textAlign: "right" }}>
          <Link
            href={`/projects/${projectId}/feedback-loops`}
            style={{ opacity: 0.6 }}
          >
            查看完整反哺历史 →
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function ReasonDistribution({
  dist,
  total,
}: {
  dist: Record<string, number>;
  total: number;
}) {
  const items = Object.entries(dist)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  if (items.length === 0) return null;
  return (
    <div style={{ marginTop: 4, fontSize: 11 }}>
      <div style={{ opacity: 0.6, marginBottom: 4 }}>流失归因分布</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {items.map(([code, n]) => {
          const meta = DROP_REASON_META[code as keyof typeof DROP_REASON_META];
          const pct = total > 0 ? Math.round((n / total) * 100) : 0;
          return (
            <span
              key={code}
              title={meta?.feedsBackTo ?? ""}
              style={{
                padding: "2px 8px",
                background: "var(--ha-bg)",
                border: "1px solid var(--ha-line)",
                borderRadius: 4,
              }}
            >
              <strong>{code}</strong>
              {meta ? ` · ${meta.label}` : ""} ({n}/{pct}%)
            </span>
          );
        })}
      </div>
    </div>
  );
}

function ActionList({ actions }: { actions: ActionItem[] }) {
  if (!actions || actions.length === 0) return null;
  return (
    <div style={{ marginTop: 10, fontSize: 11 }}>
      <div style={{ opacity: 0.6, marginBottom: 4 }}>推荐动作</div>
      <ol style={{ paddingLeft: 18, margin: 0 }}>
        {actions.map((a, i) => (
          <li key={i} style={{ marginBottom: 4 }}>
            <strong style={{ color: a.clientAlert ? "var(--ha-warn, #b8860b)" : "inherit" }}>
              [{a.target}
              {a.clientAlert ? " · 客户警报" : ""}]
            </strong>{" "}
            {a.description}
          </li>
        ))}
      </ol>
    </div>
  );
}

async function fetchLoops(projectId: string): Promise<LoopPayload[]> {
  const res = await fetch(`/api/projects/${projectId}/feedback-loops`);
  if (!res.ok) throw new Error("加载失败");
  const body = (await res.json()) as { loops: Array<Record<string, unknown>> };
  return body.loops.map((loop) => ({
    id: loop.id as string,
    sampleSize: (loop.sampleSize as number) ?? 0,
    droppedCount: (loop.droppedCount as number) ?? 0,
    reasonDistribution:
      (loop.reasonDistribution as Record<string, number> | undefined) ??
      safeParse((loop.reasonDistributionJson as string) ?? null, {}),
    funnelSnapshot:
      (loop.funnelSnapshot as Record<string, number> | undefined) ??
      safeParse((loop.funnelSnapshotJson as string) ?? null, {}),
    recommendedActions:
      (loop.recommendedActions as unknown[] | undefined) ??
      safeParse((loop.recommendedActionsJson as string) ?? null, []),
    assumptionVerdicts:
      (loop.assumptionVerdicts as unknown[] | undefined) ??
      safeParse((loop.assumptionVerdictsJson as string) ?? null, []),
    reportMarkdown: (loop.reportMarkdown as string | null) ?? null,
    status: (loop.status as string) ?? "pending_review",
    createdAt: loop.createdAt as string,
    personaVersion: (loop.personaVersion as LoopPayload["personaVersion"]) ?? null,
  }));
}

function safeParse<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}
