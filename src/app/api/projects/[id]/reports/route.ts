import { NextRequest } from "next/server";
import { z } from "zod";

import {
  buildRecommendationMarkdown,
  getProjectWithRelations,
  refreshProjectStats,
  serializeProject,
} from "@/lib/project-funnel";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const reportSchema = z.object({
  candidateIds: z.array(z.string()).optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = reportSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message || "Invalid report payload" }, { status: 400 });
  }

  const project = await getProjectWithRelations(projectId);
  if (!project) {
    return Response.json({ error: "项目不存在" }, { status: 404 });
  }

  const requestedIds = parsed.data.candidateIds;
  const candidates = project.candidates.filter((candidate) => {
    if (requestedIds?.length) return requestedIds.includes(candidate.id);
    return candidate.funnelStatus === "shortlist";
  });

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    const screening = candidate.screeningResults[0];
    if (!screening) {
      skipped += 1;
      continue;
    }

    const markdown = buildRecommendationMarkdown(project, candidate, screening);
    const title = `${candidate.name || "候选人"} - ${project.roleTitle || "推荐报告"}`;

    const existing = await prisma.recommendationReport.findFirst({
      where: { projectId, candidateId: candidate.id },
      select: { id: true },
    });

    if (existing) {
      await prisma.recommendationReport.update({
        where: { id: existing.id },
        data: {
          title,
          markdown,
          structuredJson: JSON.stringify({ screeningResultId: screening.id, source: "local_rules" }),
        },
      });
      updated += 1;
    } else {
      await prisma.recommendationReport.create({
        data: {
          projectId,
          candidateId: candidate.id,
          title,
          markdown,
          structuredJson: JSON.stringify({ screeningResultId: screening.id, source: "local_rules" }),
        },
      });
      created += 1;
    }
  }

  await refreshProjectStats(projectId);
  const refreshed = await getProjectWithRelations(projectId);

  return Response.json({
    created,
    updated,
    skipped,
    project: refreshed ? serializeProject(refreshed) : null,
  });
}
