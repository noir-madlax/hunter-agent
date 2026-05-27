import { NextRequest } from "next/server";
import { z } from "zod";

import { appendProjectMemory, orchestrateProjectToLonglist } from "@/lib/agent-orchestrator";
import { updateJobAnalysisWithInsight } from "@/lib/ai";
import { jobAnalysisSchema, normalizeJobAnalysis, type JobAnalysis } from "@/lib/job-schema";
import { getProjectWithRelations, refreshProjectStats, serializeProject } from "@/lib/project-funnel";
import { buildProjectAnalysisUpdateData } from "@/lib/project-analysis-persistence";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/session-auth";

export const runtime = "nodejs";

const updateProjectSchema = z.object({
  analysis: jobAnalysisSchema.optional(),
  insight: z.string().trim().min(1).optional(),
});

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function updateProjectAnalysis(id: string, analysis: JobAnalysis) {
  await prisma.project.update({
    where: { id },
    data: buildProjectAnalysisUpdateData(analysis),
  });
}

async function runProjectUpdateOrchestration(id: string, triggerPayload: string | object | undefined) {
  const orchestration = await orchestrateProjectToLonglist(id, "project_updated", triggerPayload);
  await refreshProjectStats(id);
  return orchestration;
}

function streamProjectInsightUpdate(id: string, currentAnalysis: JobAnalysis, insight: string) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      async start(controller) {
        const send = (payload: object) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        };

        try {
          send({ type: "status", step: "reasoning", message: "正在吸收新增信息，更新岗位画像、组织上下文和搜索策略。" });
          const updated = await updateJobAnalysisWithInsight(currentAnalysis, insight);

          send({ type: "status", step: "analysis", message: "结构化推理完成，正在保存项目认知。", mode: updated.mode });
          await updateProjectAnalysis(id, updated.analysis);
          await appendProjectMemory(id, insight, "user", "用户补充信息");
          await refreshProjectStats(id);

          const updatedProject = await getProjectWithRelations(id);
          if (updatedProject) {
            send({ type: "memory_saved", project: serializeProject(updatedProject), message: "用户输入已写入项目记忆，项目认知已更新。" });
          }

          send({ type: "status", step: "longlist", message: "正在检查基础信息是否足够进入 Longlist。" });
          const orchestration = await runProjectUpdateOrchestration(id, insight);

          const finalProject = await getProjectWithRelations(id);
          if (finalProject) {
            send({
              type: "project",
              project: serializeProject(finalProject),
              message: orchestration?.status === "blocked" ? orchestration.summary : "Longlist 已按最新输入刷新。",
            });
          }
          const doneMessage =
            orchestration?.status === "blocked"
              ? "本轮已暂停在基础信息确认环节。"
              : "本轮推理完成。评分仍需顾问显式触发。";
          for (let i = 0; i < doneMessage.length; i += 10) {
            send({ type: "answer_delta", delta: doneMessage.slice(i, i + 10) });
            await new Promise((r) => setTimeout(r, 22));
          }
          send({ type: "done", message: doneMessage });
        } catch (error) {
          console.error("[project.patch] streamed insight update failed", error);
          send({ type: "error", message: error instanceof Error ? error.message : "项目更新失败" });
        } finally {
          controller.close();
        }
      },
    }),
    {
      headers: {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "application/x-ndjson; charset=utf-8",
      },
    },
  );
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await verifyAuth())) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id } = await params;
  const project = await getProjectWithRelations(id);

  if (!project) {
    return Response.json({ error: "项目不存在" }, { status: 404 });
  }

  return Response.json({ project: serializeProject(project) });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await verifyAuth())) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateProjectSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message || "Invalid project payload" },
      { status: 400 },
    );
  }

  const existing = await getProjectWithRelations(id);
  if (!existing || !existing.jobBrief) {
    return Response.json({ error: "项目或岗位画像不存在" }, { status: 404 });
  }

  if (parsed.data.insight) {
    const currentAnalysis = normalizeJobAnalysis(parseJson<unknown>(existing.jobBrief.structuredJson, {}));
    if (request.headers.get("accept")?.includes("application/x-ndjson")) {
      return streamProjectInsightUpdate(id, currentAnalysis, parsed.data.insight);
    }

    let updated: Awaited<ReturnType<typeof updateJobAnalysisWithInsight>>;
    try {
      updated = await updateJobAnalysisWithInsight(currentAnalysis, parsed.data.insight);
      await updateProjectAnalysis(id, updated.analysis);
      await appendProjectMemory(id, parsed.data.insight, "user", "用户补充信息");
      await refreshProjectStats(id);
    } catch (error) {
      console.error("[project.patch] insight update failed", error);
      return Response.json(
        { error: error instanceof Error ? error.message : "项目更新失败" },
        { status: 500 },
      );
    }

    let orchestration: Awaited<ReturnType<typeof runProjectUpdateOrchestration>>;
    try {
      orchestration = await runProjectUpdateOrchestration(id, parsed.data.insight);
    } catch (error) {
      console.error("[project.patch] insight orchestration failed", error);
      return Response.json(
        { error: error instanceof Error ? error.message : "项目更新后刷新 Longlist 失败" },
        { status: 500 },
      );
    }
    const project = await getProjectWithRelations(id);

    if (!project) {
      return Response.json({ error: "项目不存在" }, { status: 404 });
    }

    return Response.json({ project: serializeProject(project), mode: updated.mode, orchestration });
  }

  if (!parsed.data.analysis) {
    return Response.json({ error: "请提供 analysis 或 insight" }, { status: 400 });
  }

  await updateProjectAnalysis(id, parsed.data.analysis);
  await refreshProjectStats(id);
  let orchestration: Awaited<ReturnType<typeof runProjectUpdateOrchestration>>;
  try {
    orchestration = await runProjectUpdateOrchestration(id, { analysisUpdated: true });
  } catch (error) {
    console.error("[project.patch] analysis orchestration failed", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "项目更新后刷新 Longlist 失败" },
      { status: 500 },
    );
  }
  const project = await getProjectWithRelations(id);

  if (!project) {
    return Response.json({ error: "项目不存在" }, { status: 404 });
  }

  return Response.json({ project: serializeProject(project), mode: "updated", orchestration });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await verifyAuth())) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) {
    return Response.json({ error: "项目不存在" }, { status: 404 });
  }

  await prisma.project.delete({ where: { id } });
  return Response.json({ ok: true });
}
