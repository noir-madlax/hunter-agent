#!/usr/bin/env node
/**
 * Module 12 — scheduled feedback-loop check.
 *
 * For every project, count drop events since the last FeedbackLoopRun and, when the count
 * crosses MIN_SAMPLES_FOR_REFLOW (5), draft a new FeedbackLoopRun(status="pending_review").
 *
 * Intended to be invoked by an external scheduler (system cron / GitHub Actions / pm2 cron):
 *   node scripts/run-feedback-loop-check.mjs
 *
 * The canonical aggregation logic lives in src/lib/feedback-loop.ts (used by the web API).
 * This script deliberately re-implements the small subset it needs against the Prisma client
 * so it has no Next.js-runtime dependencies. Keep the two in sync if you change the rules.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const MIN_SAMPLES_FOR_REFLOW = 5;
const ALERT_WEBHOOK_URL = process.env.FEEDBACK_LOOP_ALERT_WEBHOOK_URL || "";

const DROP_REASON_CODES = ["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8"];

const RECOMMEND_RULES = [
  {
    test: ({ pct, tierAHitRate }) =>
      (tierAHitRate ?? 1) < 0.2 && pct("D1") >= 0.5,
    action: {
      target: "stage_1",
      code: "TierA_low",
      description:
        "Tier A 命中率 <20% 且 D1 占比 >=50% — 雇主成功范本判定错了，Stage 1 信号反演重做。",
    },
  },
  {
    test: ({ pct }) => pct("D2") >= 0.4,
    action: {
      target: "stage_2",
      code: "D2",
      description: "D2 占比 >=40% — 动机筛选问题必须前置到首聊。",
    },
  },
  {
    test: ({ d3AvgOverBudgetPct }) => (d3AvgOverBudgetPct ?? 0) >= 0.3,
    action: {
      target: "stage_5",
      code: "D3",
      description: "D3 平均超预算 >=30% — 回客户预算复议 + Rubric 薪酬维度降权。",
    },
  },
  {
    test: ({ pct }) => pct("D4") >= 0.3,
    action: {
      target: "stage_1",
      code: "D4",
      description: "D4 占比 >=30% — Stage 1 跨度暗示重读，确认外派是否真要。",
    },
  },
  {
    test: ({ pct }) => pct("D6") >= 0.25,
    action: {
      target: "client_alert",
      code: "D6",
      description: "D6 占比 >=25% — 不是人的问题，是客户流程慢。警报客户，不调画像。",
      clientAlert: true,
    },
  },
  {
    test: ({ pct }) => pct("D7") >= 0.3,
    action: {
      target: "stage_2",
      code: "D7",
      description: "D7 集中 — 失败模式预演已验证，调整目标公司池。",
    },
  },
  {
    test: ({ pct }) => pct("D8") >= 0.5,
    action: {
      target: "stage_3",
      code: "D8",
      description: "D8 占比 >=50% — 库的数据质量比预估低，Stage 3 体检结论更新。",
    },
  },
];

function buildRecommendations(distribution) {
  const total = distribution.total || 0;
  const pct = (code) => (total ? (distribution.counts[code] ?? 0) / total : 0);
  const ctx = { pct, tierAHitRate: distribution.tierAHitRate, d3AvgOverBudgetPct: distribution.d3AvgOverBudgetPct };
  return RECOMMEND_RULES.filter((r) => r.test(ctx)).map((r) => r.action);
}

function renderReport(projectName, projectId, aggregate) {
  const topReasons = Object.entries(aggregate.reasonCounts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const funnelLine = Object.entries(aggregate.funnelSnapshot)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" / ");
  const actionsLines = aggregate.recommendedActions
    .map(
      (a, i) =>
        `${i + 1}. **[${a.target}${a.clientAlert ? " · 客户警报" : ""}]** ${a.description}`,
    )
    .join("\n");
  const clientAlerts = aggregate.recommendedActions.filter((a) => a.clientAlert);
  const alertLines = clientAlerts
    .map((a, i) => `${i + 1}. **${a.code}** ${a.description}`)
    .join("\n");
  const lines = [
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
                aggregate.droppedCount > 0
                  ? ((n / aggregate.droppedCount) * 100).toFixed(0)
                  : 0
              }%)`,
          )
          .join("\n"),
    "",
    aggregate.tierAHitRate !== null
      ? `Tier-A 转化率：${(aggregate.tierAHitRate * 100).toFixed(0)}%`
      : "",
    aggregate.d3AvgOverBudgetPct !== null
      ? `D3 平均超预算：${(aggregate.d3AvgOverBudgetPct * 100).toFixed(0)}%`
      : "",
    "",
    "### 3. 推荐动作",
    actionsLines || "_无触发动作（样本不足或分布不集中）_",
    "",
    "### 3.1 客户警报",
    alertLines || "_无客户侧警报_",
    "",
    "### 4. 状态",
    "本次反哺由 cron 自动起草，等待顾问 review。",
  ];
  return lines.filter((line) => line !== null).join("\n");
}

async function sendClientAlerts(project, aggregate, loopId, { deliver = true } = {}) {
  const clientAlerts = aggregate.recommendedActions.filter((action) => action.clientAlert);
  if (!clientAlerts.length) return [];

  const payload = {
    type: "feedback_loop_client_alert",
    projectId: project.id,
    projectName: project.name,
    feedbackLoopRunId: loopId,
    droppedCount: aggregate.droppedCount,
    reasonDistribution: aggregate.reasonCounts,
    alerts: clientAlerts,
    createdAt: new Date().toISOString(),
  };

  if (!deliver || !ALERT_WEBHOOK_URL) {
    return [{ ...payload, delivery: deliver ? "stdout_only" : "dry_run_stdout_only" }];
  }

  const response = await fetch(ALERT_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`client alert webhook failed: ${response.status} ${response.statusText}`);
  }
  return [{ ...payload, delivery: "webhook" }];
}

async function aggregateForProject(projectId) {
  const lastLoop = await prisma.feedbackLoopRun.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true },
  });

  const events = await prisma.outreachEvent.findMany({
    where: {
      projectId,
      ...(lastLoop ? { occurredAt: { gt: lastLoop.createdAt } } : {}),
    },
    select: {
      toStage: true,
      dropReasonCode: true,
      compRealityVsTarget: true,
      metadataJson: true,
    },
  });

  const funnelSnapshot = {};
  const reasonCounts = Object.fromEntries(DROP_REASON_CODES.map((c) => [c, 0]));
  let droppedCount = 0;
  const overBudgetPcts = [];

  for (const evt of events) {
    funnelSnapshot[evt.toStage] = (funnelSnapshot[evt.toStage] ?? 0) + 1;
    if (evt.toStage === "dropped" && evt.dropReasonCode) {
      droppedCount += 1;
      if (reasonCounts[evt.dropReasonCode] !== undefined) {
        reasonCounts[evt.dropReasonCode] += 1;
      }
      if (evt.dropReasonCode === "D3") {
        try {
          const md = JSON.parse(evt.metadataJson || "{}");
          if (typeof md.overBudgetPct === "number" && Number.isFinite(md.overBudgetPct)) {
            overBudgetPcts.push(md.overBudgetPct);
          }
        } catch {
          /* ignore */
        }
      }
    }
  }

  const candidates = await prisma.candidate.findMany({
    where: { projectId },
    select: { snapshotJson: true, decisionStage: true },
  });
  let tierATotal = 0;
  let tierAAdvanced = 0;
  for (const c of candidates) {
    if (!c.snapshotJson) continue;
    try {
      const snap = JSON.parse(c.snapshotJson);
      if (snap.tier === "A") {
        tierATotal += 1;
        if (
          c.decisionStage &&
          ["conversed", "recommended", "interviewing", "offer", "hired"].includes(
            c.decisionStage,
          )
        ) {
          tierAAdvanced += 1;
        }
      }
    } catch {
      /* ignore */
    }
  }
  const tierAHitRate = tierATotal > 0 ? tierAAdvanced / tierATotal : null;
  const d3AvgOverBudgetPct =
    overBudgetPcts.length > 0
      ? overBudgetPcts.reduce((s, v) => s + v, 0) / overBudgetPcts.length
      : null;

  const distribution = {
    total: droppedCount,
    counts: reasonCounts,
    tierAHitRate,
    d3AvgOverBudgetPct,
  };
  const recommendedActions = buildRecommendations(distribution);

  return {
    sampleSize: events.length,
    droppedCount,
    reasonCounts,
    funnelSnapshot,
    tierAHitRate,
    d3AvgOverBudgetPct,
    recommendedActions,
    lastLoopId: lastLoop?.id ?? null,
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const projects = await prisma.project.findMany({
    where: {
      outreachEvents: { some: {} },
    },
    select: { id: true, name: true },
  });

  let created = 0;
  let skipped = 0;
  const decisions = [];
  const clientAlerts = [];

  for (const project of projects) {
    const agg = await aggregateForProject(project.id);
    if (agg.droppedCount < MIN_SAMPLES_FOR_REFLOW) {
      skipped += 1;
      decisions.push({
        projectId: project.id,
        name: project.name,
        decision: "skip",
        droppedCount: agg.droppedCount,
      });
      continue;
    }

    if (dryRun) {
      const alerts = await sendClientAlerts(project, agg, null, { deliver: false });
      clientAlerts.push(...alerts);
      decisions.push({
        projectId: project.id,
        name: project.name,
        decision: "would_create",
        droppedCount: agg.droppedCount,
        recommendedActionCount: agg.recommendedActions.length,
        clientAlertCount: alerts.length,
      });
      continue;
    }

    const reportMarkdown = renderReport(project.name, project.id, agg);
    const loop = await prisma.feedbackLoopRun.create({
      data: {
        projectId: project.id,
        sampleSize: agg.sampleSize,
        droppedCount: agg.droppedCount,
        reasonDistributionJson: JSON.stringify(agg.reasonCounts),
        funnelSnapshotJson: JSON.stringify(agg.funnelSnapshot),
        recommendedActionsJson: JSON.stringify(agg.recommendedActions),
        assumptionVerdictsJson: JSON.stringify([]),
        reportMarkdown,
        status: "pending_review",
      },
    });
    const alerts = await sendClientAlerts(project, agg, loop.id);
    clientAlerts.push(...alerts);
    created += 1;
    decisions.push({
      projectId: project.id,
      name: project.name,
      decision: "created",
      droppedCount: agg.droppedCount,
      recommendedActionCount: agg.recommendedActions.length,
      clientAlertCount: alerts.length,
    });
  }

  console.log(
    JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        dryRun,
        projectsConsidered: projects.length,
        created,
        skipped,
        clientAlerts,
        decisions,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error("[feedback-loop-check] failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
