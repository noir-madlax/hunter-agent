import { NextRequest } from "next/server";
import { z } from "zod";

import { appendProjectMemory, orchestrateProjectToLonglist } from "@/lib/agent-orchestrator";
import { analyzeJobBriefStrict } from "@/lib/ai";
import { classifyProjectGaps } from "@/lib/intake-gaps";
import type { JobAnalysis } from "@/lib/job-schema";
import { prisma } from "@/lib/prisma";
import { getProjectWithRelations, refreshProjectStats, serializeProject } from "@/lib/project-funnel";
import { verifyAuth } from "@/lib/session-auth";

export const runtime = "nodejs";

const requestSchema = z.object({
  rawInput: z.string().min(8, "请至少输入一个可识别的项目线索"),
});

const llmAnalysisMaxAttempts = Number(process.env.JOB_ANALYSIS_RETRY_LIMIT || 3);
const llmAnalysisAttemptTimeoutMs = Number(process.env.JOB_ANALYSIS_ATTEMPT_TIMEOUT_MS || 60000);

type AgentLoopTaskStatus = "active" | "done" | "failed";

type AgentLoopTaskEvent = {
  type: "task";
  id: string;
  label: string;
  tool: string;
  status: AgentLoopTaskStatus;
  result?: string;
};

function wantsAgentLoopStream(request: NextRequest) {
  return request.headers.get("accept")?.includes("application/x-ndjson");
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} 超时，未得到模型输出。`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function summarizeAnalysis(analysis: JobAnalysis) {
  return [
    `客户：${analysis.jobBrief.clientCompany || "待确认"}`,
    `岗位：${analysis.jobBrief.roleTitle || "待确认"}`,
    `地点：${analysis.intakeBuilder.structuredBrief.locationAndWorkModel || "待确认"}`,
    `Must-have：${analysis.talentPersona.mustHave.slice(0, 3).join("；") || "待补充"}`,
  ].join("；");
}

function buildReasoningKernelSummary(analysis: JobAnalysis) {
  const kernel = analysis.hunterReasoningKernel;

  return [
    "Hunter 推演 Kernel：",
    `- 岗位核：${kernel.roleNucleus || analysis.talentPersona.summary || analysis.jobBrief.roleTitle}`,
    `- Core 准入：${kernel.evidenceTiers.core.slice(0, 5).join("；") || "待继续收束"}`,
    `- Strong plus：${kernel.evidenceTiers.strongPlus.slice(0, 4).join("；") || "暂无"}`,
    `- Adjacent 扩展：${kernel.evidenceTiers.adjacent.slice(0, 4).join("；") || "暂无"}`,
    `- Action gate：${kernel.actionGate.canStartLonglist ? "可先启动 Longlist" : `先补齐 ${kernel.actionGate.blockingGaps.join("、")}`}`,
  ].join("\n");
}

function buildCreationAnswer(analysis: JobAnalysis, orchestrationSummary?: string | null) {
  const gapBuckets = classifyProjectGaps(analysis.companyTeamBrief.missing);
  const blockingGaps = gapBuckets.blocking.slice(0, 4);
  const nonBlockingGaps = gapBuckets.nonBlocking.slice(0, 4);
  const targetCompanies = analysis.searchMap.targetCompanies.slice(0, 6);
  const targetTitles = analysis.searchMap.targetTitles.slice(0, 6);

  return [
    `项目已创建：${analysis.projectName || analysis.jobBrief.roleTitle || "未命名项目"}。`,
    "",
    `客户公司：${analysis.jobBrief.clientCompany || "待确认"}`,
    `目标岗位：${analysis.jobBrief.roleTitle || "待确认"}`,
    `地点/模式：${analysis.intakeBuilder.structuredBrief.locationAndWorkModel || "待确认"}`,
    `薪酬：${analysis.jobBrief.salaryBudget || "待确认"}`,
    "",
    `关键 must-have：${analysis.talentPersona.mustHave.slice(0, 5).join("；") || "待补充"}`,
    `建议目标公司：${targetCompanies.length ? targetCompanies.join("、") : "需要进一步补充业务/行业信号"}`,
    `建议目标 title：${targetTitles.length ? targetTitles.join("、") : "需要进一步补充职级/title 信号"}`,
    blockingGaps.length ? `关键阻塞缺口：${blockingGaps.join("；")}` : "关键阻塞缺口：无，基础信息足够先出 Longlist。",
    nonBlockingGaps.length ? `非阻塞待验证：${nonBlockingGaps.join("；")}。这些信息会提升推荐质量，但不影响先跑 Longlist。` : "非阻塞待验证：暂无。",
    "",
    buildReasoningKernelSummary(analysis),
    "",
    orchestrationSummary ? `Agent 执行结果：${orchestrationSummary}` : "Agent 执行结果：已完成项目初始化，Longlist 扫描结果稍后刷新。",
  ].join("\n");
}

async function createProjectFromAnalysis(rawInput: string, analysis: JobAnalysis) {
  const structuredJson = JSON.stringify(analysis);

  const project = await prisma.project.create({
    data: {
      name: analysis.projectName,
      clientCompany: analysis.jobBrief.clientCompany,
      roleTitle: analysis.jobBrief.roleTitle,
      status: "job_brief",
      jobBrief: {
        create: {
          rawInput,
          roleTitle: analysis.jobBrief.roleTitle,
          clientCompany: analysis.jobBrief.clientCompany,
          salaryBudget: analysis.jobBrief.salaryBudget,
          reportingLine: analysis.jobBrief.reportingLine,
          businessContext: analysis.jobBrief.businessContext,
          structuredJson,
        },
      },
      talentPersona: {
        create: {
          mustHaveJson: JSON.stringify(analysis.talentPersona.mustHave),
          niceToHaveJson: JSON.stringify(analysis.talentPersona.strongMatch),
          riskJson: JSON.stringify(analysis.talentPersona.riskSignals),
          structuredJson,
        },
      },
      searchMap: {
        create: {
          targetIndustriesJson: JSON.stringify(analysis.searchMap.targetIndustries),
          targetCompaniesJson: JSON.stringify(analysis.searchMap.targetCompanies),
          targetTitlesJson: JSON.stringify(analysis.searchMap.targetTitles),
          keywordsJson: JSON.stringify(analysis.searchMap.keywords),
          exclusionsJson: JSON.stringify(analysis.searchMap.excludedIndustries),
          structuredJson,
        },
      },
    },
  });

  await appendProjectMemory(project.id, rawInput, "user", "项目初始输入");
  return project;
}

function streamProjectCreation(rawInput: string) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      async start(controller) {
        const send = (payload: object) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        };
        const task = (event: Omit<AgentLoopTaskEvent, "type">) => send({ type: "task", ...event });
        let projectId = "";
        let orchestrationSummary: string | null = null;

        try {
          task({
            id: "read_input",
            label: "读取原始需求",
            tool: "Input Parser",
            status: "active",
            result: "正在识别客户公司、岗位、地点、薪酬、汇报关系和 must-have。",
          });
          task({
            id: "read_input",
            label: "读取原始需求",
            tool: "Input Parser",
            status: "done",
            result: `已读取 ${rawInput.length} 字，进入 LLM 深度结构化。`,
          });

          const attemptCount = Math.max(1, llmAnalysisMaxAttempts);
          task({
            id: "llm_analysis",
            label: "LLM 深度结构化",
            tool: "Job Analysis Model",
            status: "active",
            result: `正在复核岗位事实、组织上下文、人才画像、搜索地图和信息缺口。模型失败会自动重试，最多 ${attemptCount} 次；只有模型成功返回后才会创建项目。`,
          });
          const analysisResult = await withTimeout(
            analyzeJobBriefStrict(rawInput),
            llmAnalysisAttemptTimeoutMs * attemptCount,
            "LLM 深度结构化",
          );
          task({
            id: "llm_analysis",
            label: "LLM 深度结构化",
            tool: "Job Analysis Model",
            status: "done",
            result: `${summarizeAnalysis(analysisResult.analysis)}；模式：${analysisResult.mode}。`,
          });

          task({
            id: "create_project",
            label: "创建项目数据",
            tool: "Project Store",
            status: "active",
            result: "正在写入 Project、JobBrief、TalentPersona、SearchMap 和项目记忆。",
          });
          const project = await createProjectFromAnalysis(rawInput, analysisResult.analysis);
          projectId = project.id;
          task({
            id: "create_project",
            label: "创建项目数据",
            tool: "Project Store",
            status: "done",
            result: `项目已创建：${project.name}（${project.id}）。`,
          });
          send({ type: "project_created", projectId: project.id });

          task({
            id: "agent_orchestration",
            label: "Agent Loop 执行",
            tool: "Headhunter Agent",
            status: "active",
            result: "正在执行 Research、公司相似度、人才库扫描、Longlist 保存和质量审计。",
          });

          let orchestrationOk = true;
          try {
            const orchestration = await orchestrateProjectToLonglist(project.id, "project_created", {
              rawInput,
              streamMode: "agent_loop",
            });
            await refreshProjectStats(project.id);
            orchestrationSummary = orchestration?.summary || "Longlist 扫描已完成。";
            task({
              id: "agent_orchestration",
              label: "Agent Loop 执行",
              tool: "Headhunter Agent",
              status: orchestration?.status === "blocked" ? "failed" : "done",
              result: orchestrationSummary,
            });
          } catch (orchError) {
            orchestrationOk = false;
            orchestrationSummary = orchError instanceof Error ? orchError.message : "Agent Loop 执行失败";
            console.error("[parse-job] agent loop failed", orchError);
            task({
              id: "agent_orchestration",
              label: "Agent Loop 执行",
              tool: "Headhunter Agent",
              status: "failed",
              result: orchestrationSummary,
            });
          }
          void orchestrationOk;

          const latestProject = projectId ? await getProjectWithRelations(projectId) : null;
          if (latestProject) {
            send({ type: "project", project: serializeProject(latestProject), message: "项目已刷新。" });
          }

          const answer = buildCreationAnswer(analysisResult.analysis, orchestrationSummary);
          for (let i = 0; i < answer.length; i += 12) {
            send({ type: "answer_delta", delta: answer.slice(i, i + 12), projectId });
            await new Promise((r) => setTimeout(r, 18));
          }
          send({ type: "answer", message: answer, projectId });
          send({ type: "done", message: "Agent Loop 已完成。", projectId });
          controller.close();
        } catch (error) {
          const message = error instanceof Error ? error.message : "项目创建失败";
          task({
            id: projectId ? "project_creation_failed" : "llm_analysis",
            label: projectId ? "项目创建流程" : "LLM 深度结构化",
            tool: projectId ? "Project Store" : "Job Analysis Model",
            status: "failed",
            result: message,
          });
          send({
            type: "error",
            message,
            projectId,
          });
          controller.close();
        }
      },
    }),
    {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function POST(request: NextRequest) {
  if (!(await verifyAuth())) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message || "Invalid request" },
      { status: 400 },
    );
  }

  const { rawInput } = parsed.data;
  if (wantsAgentLoopStream(request)) {
    return streamProjectCreation(rawInput);
  }

  try {
    const attemptCount = Math.max(1, llmAnalysisMaxAttempts);
    const { analysis, mode } = await withTimeout(
      analyzeJobBriefStrict(rawInput),
      llmAnalysisAttemptTimeoutMs * attemptCount,
      "LLM 深度结构化",
    );
    const project = await createProjectFromAnalysis(rawInput, analysis);
    try {
      await orchestrateProjectToLonglist(project.id, "project_created", { rawInput, parseMode: mode });
      await refreshProjectStats(project.id);
    } catch (orchError) {
      console.error("[parse-job] agent loop failed", orchError);
    }

    return Response.json({ projectId: project.id, mode, analysis });
  } catch (error) {
    console.error("[parse-job] project creation failed", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "LLM 深度结构化失败，项目未创建。" },
      { status: 500 },
    );
  }
}
