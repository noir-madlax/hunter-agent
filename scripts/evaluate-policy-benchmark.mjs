const baseUrl = process.env.POLICY_EVAL_BASE_URL || "http://localhost:3000";
const allowRemote = process.env.POLICY_EVAL_ALLOW_REMOTE === "1";
let cookieHeader = process.env.POLICY_EVAL_COOKIE || "";

function assertBenchmarkTargetSafe(url) {
  const parsed = new URL(url);
  const host = parsed.hostname;
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.startsWith("192.168.") ||
    host.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);

  if (!isLocal && !allowRemote) {
    throw new Error(
      `Refusing to run policy benchmark against remote target ${url}. ` +
        "Run it locally, or set POLICY_EVAL_ALLOW_REMOTE=1 only for an isolated benchmark worker.",
    );
  }
}

assertBenchmarkTargetSafe(baseUrl);

const benchmarks = [
  {
    name: "SHEIN 全球经营者",
    projectId: process.env.POLICY_EVAL_SHEIN_PROJECT_ID || "cmpjvrazn00eiwc7wk0qhwwqh",
    checks: [
      {
        name: "田嘉平进入 Top10",
        type: "topNInclude",
        n: 10,
        match: { name: "田嘉平", companyIncludes: "小红书" },
      },
      {
        name: "张宇康不进入 Top10",
        type: "topNExclude",
        n: 10,
        match: { name: "张宇康", companyIncludes: "腾讯游戏" },
      },
      {
        name: "徐利华不进入 Longlist",
        type: "longlistExclude",
        match: { name: "徐利华" },
      },
      {
        name: "宋先生/唯品会业务咨询不进入 Longlist",
        type: "longlistExclude",
        match: { name: "宋先生", companyIncludes: "唯品会" },
      },
      {
        name: "张梓恩不进入 Longlist",
        type: "longlistExclude",
        match: { name: "张梓恩" },
      },
      {
        name: "Top10 没有行政/培训/HR 噪音",
        type: "topNRejectPattern",
        n: 10,
        pattern: /行政|总助|秘书|培训|组织咨询|企业大学|hrbp|人力资源/i,
      },
    ],
  },
  {
    name: "SHEIN 硬 OD 专家",
    projectId: process.env.POLICY_EVAL_SHEIN_OD_PROJECT_ID || "cmpjz1h2w0000wcu8qp3l0nho",
    checks: [
      {
        name: "Top10 必须有硬 OD / 组织效能相关证据",
        type: "topNRequirePattern",
        n: 10,
        pattern: /组织发展|组织效能|组织管理|组织诊断|组织架构|组织设计|编制|岗位价值|岗位评估|岗位称重|岗位管理|人效|od\b|咨询/i,
      },
      {
        name: "Top10 没有泛 HRBP / 培训 / 招聘 / 行政噪音",
        type: "topNRejectPattern",
        n: 10,
        pattern: /hrbp|business partner|业务伙伴|培训|学习发展|企业大学|招聘|员工关系|行政/i,
        allowWhen: /组织诊断|组织架构|组织设计|组织治理|组织效能|编制|岗位价值|岗位评估|岗位称重|岗位管理|人效|KPMG|咨询/i,
      },
    ],
  },
  {
    name: "依视路 Commercial HRBP",
    projectId: process.env.POLICY_EVAL_ESSILOR_PROJECT_ID || "cmpjvl4ps005owc7wn34p63jd",
    checks: [
      {
        name: "Top10 均为 HR/HRBP 相关",
        type: "topNRequirePattern",
        n: 10,
        pattern: /hr|human|人力|人事|组织|人才/i,
      },
      {
        name: "Top10 必须贴近 HRBP / Commercial / Sales 支持",
        type: "topNRequirePattern",
        n: 10,
        pattern: /hrbp|business partner|commercial|sales|销售|渠道|经销|人力资源合作伙伴|hr manager/i,
      },
      {
        name: "Top10 没有战略/商分/operator 噪音",
        type: "topNRejectPattern",
        n: 10,
        pattern: /战略|策略|商分|商业分析|经营分析|国家负责人|品类负责人/i,
      },
    ],
  },
  {
    name: "名气家 HRVP",
    projectId: process.env.POLICY_EVAL_HRVP_PROJECT_ID || "cmpjvlvb0008mwc7wg3gfuwwm",
    checks: [
      {
        name: "Top10 均为 HR 负责人相关",
        type: "topNRequirePattern",
        n: 10,
        pattern: /hr|human|人力|人事|人才|cho|chro/i,
      },
      {
        name: "Top10 没有战略/商分/operator 噪音",
        type: "topNRejectPattern",
        n: 10,
        pattern: /战略|策略|商分|商业分析|经营分析|国家负责人|品类负责人/i,
      },
    ],
  },
  {
    name: "算力采购经理",
    projectId: process.env.POLICY_EVAL_GPU_PROCUREMENT_PROJECT_ID || "cmpk1jaie0000wc6inw9i0amf",
    checks: [
      {
        name: "Longlist 必须是采购 / 供应链 / 供应商管理主线",
        type: "topNRequirePattern",
        n: 10,
        pattern: /采购|procurement|供应链|supply chain|供应商|sourcing|vendor|物流|贸易|纳入/i,
      },
      {
        name: "Longlist 没有 HR / 行政 / 战略商分噪音",
        type: "topNRejectPattern",
        n: 10,
        pattern: /hrbp|人力资源|人事|招聘|行政|秘书|总助|战略|策略|商分|商业分析|经营分析/i,
      },
    ],
  },
];

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
  const functionPath = /人力\/行政|人力资源/.test(row.functionPath || "") ? "" : row.functionPath;
  return [row.name, row.company, row.title, functionPath, row.reasons?.join(" "), row.concerns?.join(" ")].filter(Boolean).join(" ");
}

function candidateMatches(row, matcher) {
  if (matcher.name && row.name !== matcher.name) return false;
  if (matcher.companyIncludes && !String(row.company || "").includes(matcher.companyIncludes)) return false;
  if (matcher.titleIncludes && !String(row.title || "").includes(matcher.titleIncludes)) return false;
  return true;
}

async function fetchJson(url, init) {
  const headers = { ...(init?.headers || {}) };
  if (cookieHeader) headers.cookie = cookieHeader;
  const response = await fetch(url, { ...init, headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 300)}`);
  }
  return response.json();
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

async function loadRows(projectId) {
  await fetchJson(`${baseUrl}/api/projects/${projectId}/longlist/scan`, { method: "POST" });
  const payload = await fetchJson(`${baseUrl}/api/projects/${projectId}`);
  return (payload.project?.candidates || [])
    .filter((candidate) => candidate.funnelStatus === "longlist" && candidate.status !== "stale_scan")
    .map((candidate) => {
      const snapshot = snapshotOf(candidate);
      return {
        id: candidate.externalCandidateId,
        name: candidate.name,
        company: candidate.currentCompany,
        title: candidate.currentTitle,
        functionPath: snapshot.functionPath || "",
        score: snapshot.matchScore || 0,
        gate: snapshot.matchGate || "",
        reasons: snapshot.matchReasons || [],
        concerns: snapshot.matchConcerns || [],
      };
    })
    .sort((a, b) => b.score - a.score);
}

function runCheck(rows, check) {
  const top = rows.slice(0, check.n || rows.length);
  if (check.type === "topNInclude") {
    return top.some((row) => candidateMatches(row, check.match));
  }
  if (check.type === "topNExclude") {
    return !top.some((row) => candidateMatches(row, check.match));
  }
  if (check.type === "longlistExclude") {
    return !rows.some((row) => candidateMatches(row, check.match));
  }
  if (check.type === "topNRequirePattern") {
    return top.length > 0 && top.every((row) => check.pattern.test(rowText(row)));
  }
  if (check.type === "topNRejectPattern") {
    return top.every((row) => !check.pattern.test(rowText(row)) || Boolean(check.allowWhen && check.allowWhen.test(rowText(row))));
  }
  throw new Error(`Unknown check type: ${check.type}`);
}

let failed = 0;

await loginIfConfigured();

for (const benchmark of benchmarks) {
  try {
    const rows = await loadRows(benchmark.projectId);
    console.log(`\n${benchmark.name}`);
    console.table(
      rows.slice(0, 10).map((row, index) => ({
        rank: index + 1,
        name: row.name,
        company: row.company,
        title: row.title,
        score: row.score,
        gate: row.gate,
      })),
    );

    for (const check of benchmark.checks) {
      const passed = runCheck(rows, check);
      if (!passed) failed += 1;
      console.log(`${passed ? "PASS" : "FAIL"} ${check.name}`);
    }
  } catch (error) {
    failed += 1;
    console.log(`\n${benchmark.name}`);
    console.log(`FAIL 无法执行 benchmark: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failed) {
  console.error(`\nPolicy benchmark failed: ${failed} check(s).`);
  process.exit(1);
}

console.log("\nPolicy benchmark passed.");
