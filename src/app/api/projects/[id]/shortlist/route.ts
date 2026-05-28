import { NextRequest } from "next/server";
import { z } from "zod";

import { refreshProjectStats } from "@/lib/project-funnel";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/session-auth";

export const runtime = "nodejs";

const shortlistSchema = z.object({
  candidateIds: z.array(z.string()).min(1),
  action: z.enum(["add", "remove"]).optional().default("add"),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await verifyAuth())) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id: projectId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = shortlistSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message || "Invalid shortlist payload" }, { status: 400 });
  }

  if (parsed.data.action === "add") {
    const result = await prisma.candidate.updateMany({
      where: { projectId, id: { in: parsed.data.candidateIds } },
      data: { funnelStatus: "shortlist" },
    });
    await refreshProjectStats(projectId);
    return Response.json({ updated: result.count });
  }

  // remove: 移出 shortlist 时回到「已评分」或「longlist」，由该候选人是否有 ScreeningResult 决定
  const candidates = await prisma.candidate.findMany({
    where: { projectId, id: { in: parsed.data.candidateIds }, funnelStatus: "shortlist" },
    select: { id: true, screeningResults: { take: 1, select: { id: true } } },
  });

  let updated = 0;
  for (const candidate of candidates) {
    const next = candidate.screeningResults.length ? "screening" : "longlist";
    await prisma.candidate.update({
      where: { id: candidate.id },
      data: { funnelStatus: next },
    });
    updated += 1;
  }
  await refreshProjectStats(projectId);

  return Response.json({ updated });
}
