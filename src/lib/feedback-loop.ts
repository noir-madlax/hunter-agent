// Module 12: Feedback-loop orchestration shared by the API route and the cron script.
// Aggregates OutreachEvent data for a project into a FeedbackLoopRun draft (status="pending_review")
// applying the Module 12 trigger rules.

import { prisma } from "@/lib/prisma";
import {
  DROP_REASON_CODES,
  MIN_SAMPLES_FOR_REFLOW,
  recommendActions,
  type DropReasonCode,
  type ReasonDistribution,
} from "@/lib/outreach-feedback";

export interface FeedbackLoopAggregate {
  sampleSize: number;
  droppedCount: number;
  reasonCounts: Record<DropReasonCode, number>;
  funnelSnapshot: Record<string, number>;
  tierAHitRate: number | null;
  d3AvgOverBudgetPct: number | null;
  recommendedActions: ReturnType<typeof recommendActions>;
  windowSinceLoopId: string | null;
}

export function clientAlertActions(agg: FeedbackLoopAggregate) {
  return agg.recommendedActions.filter((action) => action.clientAlert);
}

const ALL_REASON_KEYS: readonly DropReasonCode[] = DROP_REASON_CODES;

function emptyReasonCounts(): Record<DropReasonCode, number> {
  return Object.fromEntries(ALL_REASON_KEYS.map((k) => [k, 0])) as Record<DropReasonCode, number>;
}

// Aggregate the data needed to draft a FeedbackLoopRun for `projectId`.
// Window: events occurring AFTER the last FeedbackLoopRun.createdAt for this project (or all-time
// if none exist). Drop events are those whose toStage === "dropped" and have a dropReasonCode.
export async function aggregateProjectFeedback(projectId: string): Promise<FeedbackLoopAggregate> {
  const lastLoop = await prisma.feedbackLoopRun.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true },
  });

  const eventWindowFilter = lastLoop ? { gt: lastLoop.createdAt } : undefined;

  const events = await prisma.outreachEvent.findMany({
    where: {
      projectId,
      ...(eventWindowFilter ? { occurredAt: eventWindowFilter } : {}),
    },
    select: {
      toStage: true,
      dropReasonCode: true,
      compRealityVsTarget: true,
      metadataJson: true,
    },
  });

  // Funnel snapshot: count events landing in each stage within the window.
  const funnelSnapshot: Record<string, number> = {};
  for (const evt of events) {
    funnelSnapshot[evt.toStage] = (funnelSnapshot[evt.toStage] ?? 0) + 1;
  }

  // Drop attribution
  const reasonCounts = emptyReasonCounts();
  let droppedCount = 0;
  const overBudgetPcts: number[] = [];
  for (const evt of events) {
    if (evt.toStage !== "dropped" || !evt.dropReasonCode) continue;
    droppedCount += 1;
    if ((ALL_REASON_KEYS as readonly string[]).includes(evt.dropReasonCode)) {
      reasonCounts[evt.dropReasonCode as DropReasonCode] += 1;
    }
    if (evt.dropReasonCode === "D3") {
      try {
        const md = JSON.parse(evt.metadataJson || "{}") as { overBudgetPct?: number };
        if (typeof md.overBudgetPct === "number" && Number.isFinite(md.overBudgetPct)) {
          overBudgetPcts.push(md.overBudgetPct);
        }
      } catch {
        // ignore malformed metadata
      }
    }
  }

  // Tier-A hit rate: candidates marked tier=A in snapshotJson whose decisionStage advanced past "replied".
  const candidates = await prisma.candidate.findMany({
    where: { projectId },
    select: { snapshotJson: true, decisionStage: true },
  });
  let tierATotal = 0;
  let tierAAdvanced = 0;
  for (const c of candidates) {
    if (!c.snapshotJson) continue;
    try {
      const snap = JSON.parse(c.snapshotJson) as { tier?: string };
      if (snap.tier === "A") {
        tierATotal += 1;
        if (
          c.decisionStage &&
          ["conversed", "recommended", "interviewing", "offer", "hired"].includes(c.decisionStage)
        ) {
          tierAAdvanced += 1;
        }
      }
    } catch {
      // ignore
    }
  }
  const tierAHitRate = tierATotal > 0 ? tierAAdvanced / tierATotal : null;

  const d3AvgOverBudgetPct =
    overBudgetPcts.length > 0
      ? overBudgetPcts.reduce((s, v) => s + v, 0) / overBudgetPcts.length
      : null;

  // Run the Module 12 recommendation rules.
  const distribution: ReasonDistribution = {
    total: droppedCount,
    counts: reasonCounts,
    ...(tierAHitRate !== null ? { tierAHitRate } : {}),
    ...(d3AvgOverBudgetPct !== null ? { d3AvgOverBudgetPct } : {}),
  };
  const actions = recommendActions(distribution);

  return {
    sampleSize: events.length,
    droppedCount,
    reasonCounts,
    funnelSnapshot,
    tierAHitRate,
    d3AvgOverBudgetPct,
    recommendedActions: actions,
    windowSinceLoopId: lastLoop?.id ?? null,
  };
}

// Render the loop report markdown body following module 12's Output Format.
export function renderFeedbackLoopReport(
  projectId: string,
  projectName: string | null,
  agg: FeedbackLoopAggregate,
): string {
  const topReasons = Object.entries(agg.reasonCounts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const funnelLine = Object.entries(agg.funnelSnapshot)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" / ");

  const actionsLines = agg.recommendedActions
    .map(
      (a, i) =>
        `${i + 1}. **[${a.target}${a.clientAlert ? " · 客户警报" : ""}]** ${a.description}`,
    )
    .join("\n");
  const alertLines = clientAlertActions(agg)
    .map((a, i) => `${i + 1}. **${a.code}** ${a.description}`)
    .join("\n");

  return [
    `## 项目反哺：${projectName ?? projectId} (auto-draft)`,
    "",
    "### 1. 当前漏斗（窗口期）",
    funnelLine || "_无事件_",
    "",
    `### 2. 流失归因 Top ${topReasons.length}`,
    topReasons.length === 0
      ? "_本窗口未记录流失事件_"
      : topReasons
          .map(
            ([code, n]) =>
              `- **${code}** (${n} 人，占比 ${
                agg.droppedCount > 0 ? ((n / agg.droppedCount) * 100).toFixed(0) : 0
              }%)`,
          )
          .join("\n"),
    "",
    agg.tierAHitRate !== null ? `Tier-A 转化率：${(agg.tierAHitRate * 100).toFixed(0)}%` : "",
    agg.d3AvgOverBudgetPct !== null
      ? `D3 平均超预算：${(agg.d3AvgOverBudgetPct * 100).toFixed(0)}%`
      : "",
    "",
    "### 3. 推荐动作",
    actionsLines || "_无触发动作（样本不足或分布不集中）_",
    "",
    "### 3.1 客户警报",
    alertLines || "_无客户侧警报_",
    "",
    "### 4. 状态",
    "本次反哺自动起草，等待顾问 review。点击 apply 将更新画像 / dismiss 将存档。",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

// Build a FeedbackLoopRun.create payload from an aggregate. Caller chooses when to persist.
export function buildFeedbackLoopRunPayload(
  projectId: string,
  projectName: string | null,
  agg: FeedbackLoopAggregate,
) {
  return {
    projectId,
    sampleSize: agg.sampleSize,
    droppedCount: agg.droppedCount,
    reasonDistributionJson: JSON.stringify(agg.reasonCounts),
    funnelSnapshotJson: JSON.stringify(agg.funnelSnapshot),
    recommendedActionsJson: JSON.stringify(agg.recommendedActions),
    assumptionVerdictsJson: JSON.stringify([]),
    reportMarkdown: renderFeedbackLoopReport(projectId, projectName, agg),
    status: "pending_review" as const,
  };
}

export { MIN_SAMPLES_FOR_REFLOW };
