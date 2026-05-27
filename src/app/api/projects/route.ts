import { NextRequest } from "next/server";
import { z } from "zod";

import { appendProjectMemory, orchestrateProjectToLonglist } from "@/lib/agent-orchestrator";
import { jobAnalysisSchema } from "@/lib/job-schema";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/session-auth";

export const runtime = "nodejs";

const createProjectSchema = z.object({
  rawInput: z.string().default(""),
  analysis: jobAnalysisSchema,
});

function orchestrateInBackground(projectId: string, rawInput: string) {
  setTimeout(() => {
    void orchestrateProjectToLonglist(projectId, "project_created", { rawInput }).catch((error) => {
      console.error("Project background orchestration failed", error);
    });
  }, 0);
}

export async function GET() {
  if (!(await verifyAuth())) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      clientCompany: true,
      roleTitle: true,
      funnelStatus: true,
      longlistCount: true,
      screenedCount: true,
      shortlistCount: true,
      riskCount: true,
      updatedAt: true,
    },
  });

  return Response.json({ projects });
}

export async function POST(request: NextRequest) {
  if (!(await verifyAuth())) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const parsed = createProjectSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message || "Invalid project payload" },
      { status: 400 },
    );
  }

  const { rawInput, analysis } = parsed.data;
  const structuredJson = JSON.stringify(analysis);

  const project = await prisma.project.create({
    data: {
      name: analysis.projectName,
      clientCompany: analysis.jobBrief.clientCompany,
      roleTitle: analysis.jobBrief.roleTitle,
      status: "job_brief",
      funnelStatus: "job_brief",
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

  if (rawInput.trim()) {
    await appendProjectMemory(project.id, rawInput, "user", "项目初始输入");
  }
  orchestrateInBackground(project.id, rawInput);

  return Response.json({ projectId: project.id });
}
