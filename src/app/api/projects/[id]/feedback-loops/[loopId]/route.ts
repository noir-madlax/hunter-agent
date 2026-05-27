import { NextRequest } from "next/server";
import { z } from "zod";

import { applyFeedbackLoopToPersona } from "@/lib/feedback-loop-apply";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/session-auth";

export const runtime = "nodejs";

const patchSchema = z.object({
  status: z.enum(["pending_review", "applied", "dismissed"]),
  assumptionVerdicts: z
    .array(
      z.object({
        assumption: z.string(),
        verdict: z.enum(["kept", "amended", "refuted"]),
        evidence: z.string().optional(),
      }),
    )
    .optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; loopId: string }> },
) {
  if (!(await verifyAuth())) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id: projectId, loopId } = await params;

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message || "Invalid payload" },
      { status: 400 },
    );
  }

  const loop = await prisma.feedbackLoopRun.findFirst({
    where: { id: loopId, projectId },
    select: { id: true, status: true },
  });
  if (!loop) {
    return Response.json({ error: "反哺记录不存在" }, { status: 404 });
  }

  if (parsed.data.status === "applied") {
    try {
      const applied = await applyFeedbackLoopToPersona(
        projectId,
        loop.id,
        parsed.data.assumptionVerdicts,
      );
      return Response.json(applied);
    } catch (error) {
      console.error("[feedback-loop.patch] apply failed", error);
      return Response.json(
        { error: error instanceof Error ? error.message : "反哺采纳失败" },
        { status: 500 },
      );
    }
  }

  const updated = await prisma.feedbackLoopRun.update({
    where: { id: loop.id },
    data: {
      status: parsed.data.status,
      ...(parsed.data.assumptionVerdicts
        ? { assumptionVerdictsJson: JSON.stringify(parsed.data.assumptionVerdicts) }
        : {}),
    },
  });

  return Response.json({ loop: updated });
}
