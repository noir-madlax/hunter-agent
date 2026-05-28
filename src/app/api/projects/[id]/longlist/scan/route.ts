import { NextRequest } from "next/server";

import { orchestrateProjectToLonglist } from "@/lib/agent-orchestrator";
import { getProjectWithRelations, serializeProject } from "@/lib/project-funnel";
import { acquireProjectLock } from "@/lib/project-lock";
import { verifyAuth } from "@/lib/session-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await verifyAuth())) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id: projectId } = await params;
  const lock = acquireProjectLock(projectId, "longlist_scan");
  if (!lock.ok) {
    return Response.json(
      { error: `项目已有 ${lock.type} 任务正在执行（${Math.round(lock.sinceMs / 1000)}s 前启动），请稍后再触发。` },
      { status: 409 },
    );
  }
  try {
    const orchestration = await orchestrateProjectToLonglist(projectId, "manual_rescan", { source: "longlist_scan_api" });
    const project = await getProjectWithRelations(projectId);

    if (!project) {
      return Response.json({ error: "项目不存在" }, { status: 404 });
    }

    return Response.json({
      runId: orchestration?.runId ?? null,
      status: orchestration?.status ?? "skipped",
      message: orchestration?.summary ?? "",
      project: serializeProject(project),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "人才库自动扫描失败" }, { status: 500 });
  } finally {
    lock.release();
  }
}
