import { NextResponse } from "next/server";

import { getPersolCandidateProfile } from "@/lib/persol-report-data";
import { verifyAuth } from "@/lib/session-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  if (!(await verifyAuth())) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id: idParam } = await context.params;
  const id = Number(idParam);

  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "候选人 ID 无效" }, { status: 400 });
  }

  try {
    const profile = await getPersolCandidateProfile(id);
    if (!profile) {
      return NextResponse.json({ error: "未找到候选人" }, { status: 404 });
    }

    return NextResponse.json(profile);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "候选人完整档案读取失败",
      },
      { status: 500 },
    );
  }
}
