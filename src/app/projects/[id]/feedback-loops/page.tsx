import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { FeedbackLoopsClient } from "./feedback-loops-client";

export const dynamic = "force-dynamic";

export default async function FeedbackLoopsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, name: true, clientCompany: true, roleTitle: true },
  });
  if (!project) {
    redirect("/projects");
  }

  const loops = await prisma.feedbackLoopRun.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    include: {
      personaVersion: { select: { id: true, version: true, createdAt: true } },
    },
  });

  const serializableLoops = loops.map((loop) => ({
    id: loop.id,
    sampleSize: loop.sampleSize,
    droppedCount: loop.droppedCount,
    reasonDistribution: safeParse<Record<string, number>>(loop.reasonDistributionJson, {}),
    funnelSnapshot: safeParse<Record<string, number>>(loop.funnelSnapshotJson, {}),
    recommendedActions: safeParse<unknown[]>(loop.recommendedActionsJson, []),
    assumptionVerdicts: safeParse<unknown[]>(loop.assumptionVerdictsJson, []),
    reportMarkdown: loop.reportMarkdown,
    status: loop.status,
    createdAt: loop.createdAt.toISOString(),
    personaVersion: loop.personaVersion
      ? {
          id: loop.personaVersion.id,
          version: loop.personaVersion.version,
          createdAt: loop.personaVersion.createdAt.toISOString(),
        }
      : null,
  }));

  return (
    <main style={{ padding: "32px 40px", maxWidth: 960, margin: "0 auto" }}>
      <nav style={{ marginBottom: 16, fontSize: 12 }}>
        <Link href={`/projects/${id}`} style={{ opacity: 0.7 }}>
          ← 返回项目
        </Link>
      </nav>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>反哺循环 · {project.name}</h1>
        <p style={{ opacity: 0.7, fontSize: 13, marginTop: 4 }}>
          {project.clientCompany ? `${project.clientCompany} · ` : ""}
          {project.roleTitle ?? ""}
        </p>
      </header>

      <FeedbackLoopsClient projectId={id} initialLoops={serializableLoops} />
    </main>
  );
}

function safeParse<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}
