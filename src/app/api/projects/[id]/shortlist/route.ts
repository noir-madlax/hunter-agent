import { NextRequest } from "next/server";
import { z } from "zod";

import { refreshProjectStats } from "@/lib/project-funnel";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const shortlistSchema = z.object({
  candidateIds: z.array(z.string()).min(1),
  action: z.enum(["add", "remove"]).optional().default("add"),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = shortlistSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message || "Invalid shortlist payload" }, { status: 400 });
  }

  const funnelStatus = parsed.data.action === "add" ? "shortlist" : "longlist";

  const result = await prisma.candidate.updateMany({
    where: {
      projectId,
      id: { in: parsed.data.candidateIds },
    },
    data: { funnelStatus },
  });

  await refreshProjectStats(projectId);

  return Response.json({ updated: result.count });
}
