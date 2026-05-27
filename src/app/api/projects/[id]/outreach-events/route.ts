import { NextRequest } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/session-auth";
import {
  DECISION_STAGES,
  DROP_REASON_CODES,
  OUTREACH_CHANNELS,
  OUTREACH_RESULTS,
  COMP_REALITY_VALUES,
} from "@/lib/outreach-feedback";

export const runtime = "nodejs";

const createEventSchema = z.object({
  candidateId: z.string().min(1),
  toStage: z.enum(DECISION_STAGES),
  channel: z.enum(OUTREACH_CHANNELS).optional(),
  result: z.enum(OUTREACH_RESULTS).optional(),
  dropReasonCode: z.enum(DROP_REASON_CODES).optional(),
  dropReasonNote: z.string().trim().max(2000).optional(),
  compRealityVsTarget: z.enum(COMP_REALITY_VALUES).optional(),
  // Free-form structured metadata (e.g. {"overBudgetPct": 0.3})
  metadata: z.record(z.string(), z.unknown()).optional(),
  occurredAt: z.string().datetime().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await verifyAuth())) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id: projectId } = await params;

  const body = await request.json().catch(() => null);
  const parsed = createEventSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message || "Invalid event payload" },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // Module 12 Guardrail: a "dropped" transition must carry a reason code.
  if (data.toStage === "dropped" && !data.dropReasonCode) {
    return Response.json(
      { error: "流失事件必须提供 dropReasonCode (D1-D8)" },
      { status: 400 },
    );
  }

  const candidate = await prisma.candidate.findFirst({
    where: { id: data.candidateId, projectId },
    select: { id: true, decisionStage: true, projectId: true },
  });
  if (!candidate) {
    return Response.json({ error: "候选人不存在或不属于该项目" }, { status: 404 });
  }

  const occurredAt = data.occurredAt ? new Date(data.occurredAt) : new Date();
  const fromStage = candidate.decisionStage;

  const [event] = await prisma.$transaction([
    prisma.outreachEvent.create({
      data: {
        candidateId: candidate.id,
        projectId,
        fromStage,
        toStage: data.toStage,
        channel: data.channel,
        result: data.result,
        dropReasonCode: data.dropReasonCode,
        dropReasonNote: data.dropReasonNote,
        compRealityVsTarget: data.compRealityVsTarget,
        metadataJson: JSON.stringify(data.metadata ?? {}),
        occurredAt,
      },
    }),
    prisma.candidate.update({
      where: { id: candidate.id },
      data: {
        decisionStage: data.toStage,
        outreachChannel: data.channel ?? undefined,
        outreachResult: data.result ?? undefined,
        dropReasonCode: data.dropReasonCode ?? undefined,
        dropReasonNote: data.dropReasonNote ?? undefined,
        compRealityVsTarget: data.compRealityVsTarget ?? undefined,
        outreachedAt:
          fromStage === null && data.toStage !== "dropped" ? occurredAt : undefined,
        lastStageChangeAt: occurredAt,
      },
    }),
  ]);

  return Response.json({ event });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await verifyAuth())) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id: projectId } = await params;

  const events = await prisma.outreachEvent.findMany({
    where: { projectId },
    orderBy: { occurredAt: "desc" },
    take: 200,
    select: {
      id: true,
      candidateId: true,
      fromStage: true,
      toStage: true,
      channel: true,
      result: true,
      dropReasonCode: true,
      dropReasonNote: true,
      compRealityVsTarget: true,
      metadataJson: true,
      occurredAt: true,
      createdAt: true,
    },
  });

  return Response.json({ events });
}
