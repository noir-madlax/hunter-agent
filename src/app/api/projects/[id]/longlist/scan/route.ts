import { NextRequest } from "next/server";

import { orchestrateProjectToLonglist } from "@/lib/agent-orchestrator";
import { getProjectWithRelations, serializeProject } from "@/lib/project-funnel";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
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
  }
}
