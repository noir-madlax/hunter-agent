import { NextRequest } from "next/server";
import { z } from "zod";

import {
  refreshProjectStats,
  snapshotToRawProfile,
  type CandidateSnapshot,
} from "@/lib/project-funnel";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/session-auth";

export const runtime = "nodejs";

const looseCandidateSnapshotSchema = z.object({
  id: z.number(),
  name: z.string().optional().default(""),
  chineseName: z.string().optional().default(""),
  englishName: z.string().optional().default(""),
  companyName: z.string().optional().default(""),
  title: z.string().optional().default(""),
  firstExperienceTitle: z.string().optional().default(""),
  functionPath: z.string().optional().default(""),
  functionTags: z.array(z.string()).optional().default([]),
  mobile: z.string().optional().default(""),
  email: z.string().optional().default(""),
  age: z.number().nullable().optional().default(null),
  gender: z.string().optional().default("未知"),
  annualSalary: z.number().nullable().optional().default(null),
  expectedSalary: z.string().optional().default(""),
  compensationDetail: z.string().optional().default(""),
  lastContactDate: z.string().optional().default(""),
  lastUpdateDate: z.string().optional().default(""),
  lastStatusDate: z.string().optional().default(""),
  dateAdded: z.string().optional().default(""),
  source: z.string().optional().default(""),
  status: z.string().optional().default(""),
  consultantRank: z.string().optional().default(""),
  owner: z.union([z.number(), z.string()]).nullable().optional().default(null),
  addedBy: z.union([z.number(), z.string()]).nullable().optional().default(null),
  companyId: z.union([z.number(), z.string()]).nullable().optional().default(null),
  functionCodes: z.array(z.union([z.number(), z.string()])).optional().default([]),
  cityCodes: z.array(z.union([z.number(), z.string()])).optional().default([]),
  locationCodes: z.array(z.union([z.number(), z.string()])).optional().default([]),
  industryCodes: z.array(z.union([z.number(), z.string()])).optional().default([]),
  educationCount: z.number().optional().default(0),
  experienceCount: z.number().optional().default(0),
  projectCount: z.number().optional().default(0),
  languageCount: z.number().optional().default(0),
  skillCount: z.number().optional().default(0),
  notes: z.array(z.string()).optional().default([]),
  hasNotes: z.boolean().optional().default(false),
});

const addCandidatesSchema = z.object({
  candidates: z.array(looseCandidateSnapshotSchema).min(1),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await verifyAuth())) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id: projectId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = addCandidatesSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message || "Invalid candidate payload" },
      { status: 400 },
    );
  }

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) {
    return Response.json({ error: "项目不存在" }, { status: 404 });
  }

  let added = 0;
  let updated = 0;

  for (const snapshot of parsed.data.candidates as CandidateSnapshot[]) {
    const externalCandidateId = String(snapshot.id);
    const existing = await prisma.candidate.findFirst({
      where: { projectId, externalSource: "persol", externalCandidateId },
      select: { id: true },
    });
    const candidateData = {
      name: snapshot.name || snapshot.chineseName || snapshot.englishName || null,
      currentCompany: snapshot.companyName || null,
      currentTitle: snapshot.title || snapshot.firstExperienceTitle || null,
      rawProfile: snapshotToRawProfile(snapshot),
      externalSource: "persol",
      externalCandidateId,
      snapshotJson: JSON.stringify(snapshot),
    };

    await prisma.candidate.upsert({
      where: {
        projectId_externalSource_externalCandidateId: {
          projectId,
          externalSource: "persol",
          externalCandidateId,
        },
      },
      update: candidateData,
      create: {
        ...candidateData,
        projectId,
        funnelStatus: "longlist",
        status: "pending_screening",
      },
    });

    if (existing) updated += 1;
    else added += 1;
  }

  await refreshProjectStats(projectId);

  return Response.json({ added, updated });
}
