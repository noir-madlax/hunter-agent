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
  const { id: projectId } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = runScreeningSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message || "Invalid screening payload" }, { status: 400 });
  }

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

  for (const candidate of eligible) {
    if (!parsed.data.rerun && candidate.screeningResults.length) {
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

      await prisma.screeningResult.create({
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
      });
      await prisma.candidate.update({
        where: { id: candidate.id },
        data: { status: "screened" },
      });
      screened += 1;
    } catch (error) {
      failed.push({
        candidateId: candidate.id,
        name: candidate.name || candidate.currentCompany || candidate.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

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
}
