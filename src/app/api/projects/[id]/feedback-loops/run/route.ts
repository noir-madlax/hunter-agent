import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/session-auth";
import {
  aggregateProjectFeedback,
  buildFeedbackLoopRunPayload,
} from "@/lib/feedback-loop";
import { canTriggerReflow } from "@/lib/outreach-feedback";

export const runtime = "nodejs";

// POST /api/projects/[id]/feedback-loops/run
// Manually triggers a reflow. Returns the drafted FeedbackLoopRun (status="pending_review")
// or 422 if the minimum-sample guard fails (Module 12 Guardrail 1).
//
// Query param ?force=1 bypasses the sample-size guard (useful for testing).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await verifyAuth())) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id: projectId } = await params;
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });
  if (!project) {
    return Response.json({ error: "项目不存在" }, { status: 404 });
  }

  const aggregate = await aggregateProjectFeedback(projectId);

  if (!force && !canTriggerReflow(aggregate.droppedCount)) {
    return Response.json(
      {
        error: `样本不足：本窗口仅 ${aggregate.droppedCount} 个流失样本，需 >= 5 才能触发反哺（Module 12 Guardrail 1）。可在 URL 加 ?force=1 强制触发。`,
        aggregate,
      },
      { status: 422 },
    );
  }

  const payload = buildFeedbackLoopRunPayload(projectId, project.name, aggregate);
  const loop = await prisma.feedbackLoopRun.create({ data: payload });

  return Response.json({ loop, aggregate });
}
