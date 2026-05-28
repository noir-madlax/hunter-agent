import { NextRequest } from "next/server";
import { z } from "zod";

import { screenCandidateWithModel } from "@/lib/ai";
import { normalizeJobAnalysis } from "@/lib/job-schema";
import {
  applyRequirementGateToScreening,
  refreshProjectStats,
  runLocalScreening,
  SCREENING_LIMIT,
  type CandidateSnapshot,
} from "@/lib/project-funnel";
import { prisma } from "@/lib/prisma";
import { acquireProjectLock } from "@/lib/project-lock";
import { verifyAuth } from "@/lib/session-auth";

export const runtime = "nodejs";

const runScreeningSchema = z.object({
  rerun: z.boolean().optional().default(false),
});

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await verifyAuth())) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id: projectId } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = runScreeningSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message || "Invalid screening payload" }, { status: 400 });
  }

  const lock = acquireProjectLock(projectId, "screening");
  if (!lock.ok) {
    return Response.json(
      { error: `项目已有 ${lock.type} 任务正在执行（${Math.round(lock.sinceMs / 1000)}s 前启动），请稍后再触发。` },
      { status: 409 },
    );
  }

  try {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      jobBrief: true,
      candidates: {
        where: { funnelStatus: { not: "archived" }, status: { not: "stale_scan" } },
        orderBy: [{ updatedAt: "desc" }, { addedToProjectAt: "asc" }],
        include: { screeningResults: { orderBy: { updatedAt: "desc" }, take: 1 } },
      },
    },
  });

  if (!project || !project.jobBrief) {
    return Response.json({ error: "项目或岗位画像不存在" }, { status: 404 });
  }

  const analysis = normalizeJobAnalysis(parseJson<unknown>(project.jobBrief.structuredJson, {}));
  const eligible = project.candidates.slice(0, SCREENING_LIMIT);
  const overLimit = project.candidates.slice(SCREENING_LIMIT);
  let screened = 0;
  let skipped = 0;
  const failed: Array<{ candidateId: string; name: string; error: string }> = [];

  for (const candidate of overLimit) {
    if (candidate.status !== "unscored_limit") {
      await prisma.candidate.update({
        where: { id: candidate.id },
        data: { status: "unscored_limit" },
      });
    }
  }

  // 并发上限：避免 DeepSeek 限流 + SQLite 写串行
  const CONCURRENCY = Math.max(1, Number(process.env.SCREENING_CONCURRENCY || 3));
  const rerun = parsed.data.rerun;
  const queue = [...eligible];
  async function worker() {
    while (queue.length) {
      const candidate = queue.shift();
      if (!candidate) return;
      if (!rerun && candidate.screeningResults.length) {
        skipped += 1;
        continue;
      }
      try {
        const snapshot = parseJson<CandidateSnapshot>(candidate.snapshotJson, {} as CandidateSnapshot);
        const localResult = runLocalScreening(analysis, snapshot);
        const screenedWithModel = await screenCandidateWithModel(analysis, snapshot, localResult);
        const result = applyRequirementGateToScreening(analysis, snapshot, screenedWithModel.result);
        const mode = screenedWithModel.mode;
        const structuredJson = JSON.stringify(result);
        // 重跑评分：删旧记录再写新的，避免 DB 累积冗余（50 候选 × 5 次 rerun = 250 行旧数据）
        await prisma.$transaction([
          prisma.screeningResult.deleteMany({ where: { candidateId: candidate.id } }),
          prisma.screeningResult.create({
            data: {
              candidateId: candidate.id,
              recommendation: result.recommendation,
              score: result.score,
              structuredJson,
              dimensionScoresJson: JSON.stringify(result.dimensionScores),
              evidenceJson: JSON.stringify(result.evidence),
              risksJson: JSON.stringify(result.risks),
              missingInfoJson: JSON.stringify(result.missingInfo),
              questionsJson: JSON.stringify(result.questions),
              modelMode: mode,
            },
          }),
          prisma.candidate.update({
            where: { id: candidate.id },
            data: { status: "screened" },
          }),
        ]);
        screened += 1;
      } catch (error) {
        failed.push({
          candidateId: candidate.id,
          name: candidate.name || candidate.currentCompany || candidate.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  await refreshProjectStats(projectId);

  return Response.json(
    {
      screened,
      skipped,
      failed: failed.length,
      failedCandidates: failed,
      overLimit: overLimit.length,
      limit: SCREENING_LIMIT,
    },
    { status: failed.length ? 207 : 200 },
  );
  } finally {
    lock.release();
  }
}
