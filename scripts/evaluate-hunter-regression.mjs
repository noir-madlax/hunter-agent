const baseUrl = process.env.HUNTER_REGRESSION_BASE_URL || "http://localhost:3000";
const sheinProjectId = process.env.HUNTER_REGRESSION_SHEIN_PROJECT_ID || "cmpjvrazn00eiwc7wk0qhwwqh";
const timeoutMs = Number(process.env.HUNTER_REGRESSION_TIMEOUT_MS || 240000);
let cookieHeader = process.env.HUNTER_REGRESSION_COOKIE || "";

function fail(message, details) {
  const error = new Error(message);
  error.details = details;
  throw error;
}

function assert(condition, message, details) {
  if (!condition) fail(message, details);
}

async function fetchJson(path, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { ...(init.headers || {}) };
    if (cookieHeader) headers.cookie = cookieHeader;
    const response = await fetch(`${baseUrl}${path}`, { ...init, headers, signal: controller.signal });
    const text = await response.text();
    if (!response.ok) {
      fail(`${init.method || "GET"} ${path} failed: ${response.status} ${response.statusText}`, text.slice(0, 500));
    }
    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(timeout);
  }
}

async function loginIfConfigured() {
  if (cookieHeader || !process.env.HUNTER_AUTH_USERNAME || !process.env.HUNTER_AUTH_PASSWORD) return;
  const body = new URLSearchParams({
    username: process.env.HUNTER_AUTH_USERNAME,
    password: process.env.HUNTER_AUTH_PASSWORD,
    next: "/projects",
  });
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    body,
    redirect: "manual",
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    cookieHeader = setCookie.split(";")[0];
  }
}

function snapshotOf(candidate) {
  if (candidate.snapshot && typeof candidate.snapshot === "object") return candidate.snapshot;
  if (candidate.snapshotJson && typeof candidate.snapshotJson === "object") return candidate.snapshotJson;
  if (candidate.snapshotJson && typeof candidate.snapshotJson === "string") {
    try {
      return JSON.parse(candidate.snapshotJson);
    } catch {
      return {};
    }
  }
  return {};
}

function rowText(row) {
  return [
    row.name,
    row.company,
    row.title,
    row.snapshot?.functionPath,
    row.snapshot?.matchReasons,
    row.snapshot?.matchConcerns,
    row.snapshot?.verifiedFacts,
    row.snapshot?.weakSignals,
    row.snapshot?.inferredFit,
    row.snapshot?.verificationGaps,
    row.snapshot?.comparisonVerdict,
    row.snapshot?.differentiators,
    row.snapshot?.tradeoffs,
  ]
    .flat()
    .filter(Boolean)
    .join(" ");
}

async function main() {
  await loginIfConfigured();
  const before = await fetchJson(`/api/projects/${sheinProjectId}`);
  const analysis = before.project?.analysis;
  assert(analysis, "Project analysis missing");
  assert(analysis.roleProfile?.roleFamily === "operator", "SHEIN roleProfile should compile to operator", analysis.roleProfile);
  assert(
    /业务|经营|策略|商分|增长|落地/.test(
      [
        analysis.roleProfile.roleEssence,
        analysis.roleProfile.successProfile,
        analysis.roleProfile.strongSignals,
        analysis.roleProfile.falsePositiveRisks,
      ]
        .flat()
        .filter(Boolean)
        .join(" "),
    ),
    "SHEIN roleProfile lacks operator reasoning vocabulary",
    analysis.roleProfile,
  );

  const scan = await fetchJson(`/api/projects/${sheinProjectId}/longlist/scan`, { method: "POST" });
  const candidates = (scan.project?.candidates || [])
    .map((candidate) => ({
      id: candidate.externalCandidateId,
      name: candidate.name,
      company: candidate.currentCompany,
      title: candidate.currentTitle,
      status: candidate.status,
      funnelStatus: candidate.funnelStatus,
      snapshot: snapshotOf(candidate),
    }))
    .filter((candidate) => candidate.funnelStatus === "longlist" && candidate.status !== "stale_scan" && candidate.snapshot?.matchScore)
    .sort((a, b) => (b.snapshot.matchScore || 0) - (a.snapshot.matchScore || 0));

  assert(candidates.length > 0, "Longlist scan returned no ranked candidates");
  const top10 = candidates.slice(0, 10);
  assert(
    top10.every((row) => Array.isArray(row.snapshot.verifiedFacts) && Array.isArray(row.snapshot.verificationGaps)),
    "Top10 candidates must carry evidence buckets",
    top10.map((row) => ({ name: row.name, status: row.status, snapshot: row.snapshot })),
  );
  assert(
    top10.every((row) => Number.isInteger(row.snapshot.comparisonRank) && row.snapshot.comparisonRank > 0 && row.snapshot.comparisonVerdict),
    "Top10 candidates must carry shortlist comparison rank/verdict",
    top10.map((row) => ({ name: row.name, rank: row.snapshot.comparisonRank, verdict: row.snapshot.comparisonVerdict })),
  );
  assert(
    top10.every((row) => !/hrbp|人力资源|人事|招聘|行政|总助|秘书|培训/i.test(rowText(row))),
    "SHEIN operator Top10 still contains HR/admin/training noise",
    top10.map((row) => ({ name: row.name, company: row.company, title: row.title, text: rowText(row).slice(0, 400) })),
  );

  console.log("Hunter regression passed.");
  console.table(
    top10.map((row, index) => ({
      rank: index + 1,
      name: row.name,
      company: row.company,
      title: row.title,
      score: row.snapshot.matchScore,
      gate: row.snapshot.matchGate,
    })),
  );
}

main().catch((error) => {
  console.error("Hunter regression failed.");
  console.error(error.message);
  if (error.details) console.error(error.details);
  process.exit(1);
});
