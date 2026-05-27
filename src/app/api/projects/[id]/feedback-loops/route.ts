import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/session-auth";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await verifyAuth())) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id: projectId } = await params;

  const loops = await prisma.feedbackLoopRun.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      personaVersion: {
        select: { id: true, version: true, createdAt: true },
      },
    },
  });

  return Response.json({ loops });
}
