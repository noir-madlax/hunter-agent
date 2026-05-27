import { updateJobAnalysisWithInsight } from "@/lib/ai";
import { normalizeJobAnalysis, type JobAnalysis } from "@/lib/job-schema";
import { prisma } from "@/lib/prisma";
import { buildProjectAnalysisUpdateData } from "@/lib/project-analysis-persistence";

type ApplyMode = "deepseek" | "openai" | "fallback" | "skipped_client_alert_only" | "already_applied";

interface ApplyFeedbackLoopResult {
  loop: Awaited<ReturnType<typeof prisma.feedbackLoopRun.update>>;
  personaVersion: { id: string; version: number; createdAt: Date } | null;
  mode: ApplyMode;
  skippedReason?: string;
}

type PersonaShape = JobAnalysis["talentPersona"];

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function uniqueStrings(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function diffPersona(before: PersonaShape, after: PersonaShape) {
  const fields: Array<keyof PersonaShape> = [
    "summary",
    "mustHave",
    "strongMatch",
    "riskSignals",
    "evidenceToCollect",
  ];

  return fields
    .map((field) => {
      const oldValue = before[field];
      const newValue = after[field];
      if (JSON.stringify(oldValue) === JSON.stringify(newValue)) return null;
      return {
        field,
        oldValue,
        newValue,
        evidence: "FeedbackLoopRun.reportMarkdown + recommendedActionsJson",
      };
    })
    .filter(Boolean);
}

function buildFeedbackInsight(loop: {
  id: string;
  droppedCount: number;
  reasonDistributionJson: string;
  funnelSnapshotJson: string;
  recommendedActionsJson: string;
  assumptionVerdictsJson: string;
  reportMarkdown: string | null;
}) {
  return [
    "Module 12 Outreach Conversion Feedback Loop 已被顾问采纳。",
    "",
    `FeedbackLoopRun: ${loop.id}`,
    `Dropped samples: ${loop.droppedCount}`,
    "",
    "Reason distribution JSON:",
    loop.reasonDistributionJson,
    "",
    "Funnel snapshot JSON:",
    loop.funnelSnapshotJson,
    "",
    "Recommended actions JSON:",
    loop.recommendedActionsJson,
    "",
    "Assumption verdicts JSON:",
    loop.assumptionVerdictsJson,
    "",
    "Report markdown:",
    loop.reportMarkdown ?? "",
    "",
    "请根据以上真实触达数据更新完整项目认知，重点更新 talentPersona / roleProfile / searchMap / screeningPlan / scoringModel。",
    "Guardrails:",
    "- D1/D2/D4/D7/D8 可回灌画像、失败模式、库体检和搜索策略。",
    "- D3 只能触发预算复议或薪酬维度调整，不要把超预算候选人简单当作画像错误。",
    "- D6 是客户流程慢/反 Offer 风险，只能形成客户进度警报，不得据此改变候选人画像。",
    "- 保留 v1→v2 演化逻辑：只改有数据证据支持的部分，不静默覆盖可靠事实。",
  ].join("\n");
}

function applyDeterministicFallback(current: JobAnalysis, loop: {
  recommendedActionsJson: string;
  reportMarkdown: string | null;
}) {
  const actions = parseJson<Array<{ code?: string; target?: string; description?: string; clientAlert?: boolean }>>(
    loop.recommendedActionsJson,
    [],
  );
  const persona = current.talentPersona;
  const evidenceAdditions = actions
    .filter((action) => !action.clientAlert)
    .map((action) => action.description ?? "")
    .filter(Boolean);
  const riskAdditions = actions
    .filter((action) => action.code && ["D2", "D3", "D4", "D5", "D7", "D8"].includes(action.code))
    .map((action) => action.description ?? "")
    .filter(Boolean);

  return normalizeJobAnalysis({
    ...current,
    talentPersona: {
      ...persona,
      summary: `${persona.summary}（已根据触达反哺复核）`,
      riskSignals: uniqueStrings([...persona.riskSignals, ...riskAdditions]).slice(0, 16),
      evidenceToCollect: uniqueStrings([
        ...persona.evidenceToCollect,
        ...evidenceAdditions,
        loop.reportMarkdown ? "复核本轮 FeedbackLoopRun 报告中的流失归因和客户警报。" : "",
      ]).slice(0, 14),
    },
    nextActions: uniqueStrings([
      ...current.nextActions,
      ...actions.map((action) => action.description ?? "").filter(Boolean),
    ]).slice(0, 10),
  });
}

export async function applyFeedbackLoopToPersona(
  projectId: string,
  loopId: string,
  assumptionVerdicts?: unknown[],
): Promise<ApplyFeedbackLoopResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      jobBrief: true,
      feedbackLoopRuns: {
        where: { id: loopId },
        take: 1,
      },
    },
  });
  const loop = project?.feedbackLoopRuns[0] ?? null;
  if (!project || !project.jobBrief || !loop) {
    throw new Error("反哺记录不存在");
  }

  if (loop.status === "applied") {
    const existingPersonaVersion = await prisma.personaVersion.findUnique({
      where: { feedbackLoopRunId: loop.id },
      select: { id: true, version: true, createdAt: true },
    });
    return {
      loop,
      personaVersion: existingPersonaVersion,
      mode: existingPersonaVersion ? "already_applied" : "skipped_client_alert_only",
      ...(existingPersonaVersion
        ? {}
        : { skippedReason: "该反哺记录已采纳，且未生成画像版本。" }),
    };
  }

  const actions = parseJson<Array<{ target?: string; clientAlert?: boolean }>>(
    loop.recommendedActionsJson,
    [],
  );
  const personaChangingActions = actions.filter(
    (action) => !action.clientAlert && action.target !== "client_alert",
  );

  if (personaChangingActions.length === 0) {
    const updated = await prisma.feedbackLoopRun.update({
      where: { id: loop.id },
      data: {
        status: "applied",
        ...(assumptionVerdicts ? { assumptionVerdictsJson: JSON.stringify(assumptionVerdicts) } : {}),
      },
    });
    return {
      loop: updated,
      personaVersion: null,
      mode: "skipped_client_alert_only",
      skippedReason: "本轮只有客户流程警报（D6/client_alert），按 Module 12 不调整候选人画像。",
    };
  }

  const currentAnalysis = normalizeJobAnalysis(parseJson<unknown>(project.jobBrief.structuredJson, {}));
  const beforePersona = currentAnalysis.talentPersona;
  let nextAnalysis: JobAnalysis;
  let mode: ApplyMode;

  if (process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY) {
    const updated = await updateJobAnalysisWithInsight(currentAnalysis, buildFeedbackInsight(loop));
    nextAnalysis = updated.analysis;
    mode = updated.mode;
  } else {
    nextAnalysis = applyDeterministicFallback(currentAnalysis, loop);
    mode = "fallback";
  }

  const nextPersona = nextAnalysis.talentPersona;
  const changes = diffPersona(beforePersona, nextPersona);
  const structuredJson = JSON.stringify(nextAnalysis);
  const reasoningMarkdown = [
    `FeedbackLoopRun ${loop.id} 已采纳，生成画像新版本。`,
    `LLM mode: ${mode}`,
    "",
    loop.reportMarkdown ?? "",
  ].join("\n");

  return prisma.$transaction(async (tx) => {
    const latestVersion = await tx.personaVersion.findFirst({
      where: { projectId },
      orderBy: { version: "desc" },
      select: { version: true },
    });

    let nextVersion = (latestVersion?.version ?? 0) + 1;
    if (!latestVersion) {
      await tx.personaVersion.create({
        data: {
          projectId,
          version: 1,
          mustHaveJson: JSON.stringify(beforePersona.mustHave),
          niceToHaveJson: JSON.stringify(beforePersona.strongMatch),
          riskJson: JSON.stringify(beforePersona.riskSignals),
          structuredJson: JSON.stringify(currentAnalysis),
          changesJson: JSON.stringify([]),
          reasoningMarkdown: "Baseline persona captured before first feedback-loop apply.",
        },
      });
      nextVersion = 2;
    }

    await tx.project.update({
      where: { id: projectId },
      data: buildProjectAnalysisUpdateData(nextAnalysis),
    });

    const personaVersion = await tx.personaVersion.create({
      data: {
        projectId,
        version: nextVersion,
        feedbackLoopRunId: loop.id,
        mustHaveJson: JSON.stringify(nextPersona.mustHave),
        niceToHaveJson: JSON.stringify(nextPersona.strongMatch),
        riskJson: JSON.stringify(nextPersona.riskSignals),
        structuredJson,
        changesJson: JSON.stringify(changes),
        reasoningMarkdown,
      },
      select: { id: true, version: true, createdAt: true },
    });

    const updatedLoop = await tx.feedbackLoopRun.update({
      where: { id: loop.id },
      data: {
        status: "applied",
        ...(assumptionVerdicts ? { assumptionVerdictsJson: JSON.stringify(assumptionVerdicts) } : {}),
      },
    });

    return { loop: updatedLoop, personaVersion, mode };
  });
}
