import { NextResponse } from "next/server";

import { searchPersolCandidates, type CandidateSearchParams } from "@/lib/persol-report-data";
import { verifyAuth } from "@/lib/session-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function numberParam(value: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(request: Request) {
  if (!(await verifyAuth())) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const params: CandidateSearchParams = {
    q: searchParams.get("q") ?? undefined,
    page: numberParam(searchParams.get("page")),
    pageSize: numberParam(searchParams.get("pageSize")),
    source: searchParams.get("source") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    hasNotes: searchParams.get("hasNotes") ?? undefined,
    minAge: numberParam(searchParams.get("minAge")),
    maxAge: numberParam(searchParams.get("maxAge")),
    sort: (searchParams.get("sort") as CandidateSearchParams["sort"]) ?? undefined,
    order: (searchParams.get("order") as CandidateSearchParams["order"]) ?? undefined,
  };

  try {
    const result = await searchPersolCandidates(params);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "候选人报表读取失败",
      },
      { status: 500 },
    );
  }
}
