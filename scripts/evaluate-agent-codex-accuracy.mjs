const baseUrl = process.env.POLICY_EVAL_BASE_URL || "http://localhost:3000";
const allowRemote = process.env.POLICY_EVAL_ALLOW_REMOTE === "1";

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
      `Refusing to run full Codex accuracy replay against remote target ${url}. ` +
        "Run it locally, or set POLICY_EVAL_ALLOW_REMOTE=1 only for an isolated benchmark worker.",
    );
  }
}

assertBenchmarkTargetSafe(baseUrl);

const cases = [
  {
    name: "SHEIN 全球经营者",
    projectId: process.env.POLICY_EVAL_SHEIN_PROJECT_ID || "cmpjvrazn00eiwc7wk0qhwwqh",
    codexJudgments: [
      { name: "田嘉平应进入 Top10", type: "topNInclude", n: 10, match: { name: "田嘉平", companyIncludes: "小红书" } },
      { name: "张宇康合适但不应进 Top10", type: "topNExclude", n: 10, match: { name: "张宇康", companyIncludes: "腾讯游戏" } },
      { name: "徐利华行政岗位不适合", type: "longlistExclude", match: { name: "徐利华" } },
      { name: "宋先生/唯品会业务咨询偏培训组织咨询", type: "longlistExclude", match: { name: "宋先生", companyIncludes: "唯品会" } },
      { name: "张梓恩/总助营业战略完全不适合", type: "longlistExclude", match: { name: "张梓恩" } },
    ],
    top10Policy: {
      require: [/战略|策略|商分|商业分析|经营分析|国家负责人|品类负责人|中台|operator/i],
      reject: [/行政|总助|秘书|培训|组织咨询|企业大学|hrbp|人力资源/i],
    },
  },
  {
    name: "SHEIN 硬 OD 专家",
    projectId: process.env.POLICY_EVAL_SHEIN_OD_PROJECT_ID || "cmpjz1h2w0000wcu8qp3l0nho",
    codexJudgments: [],
    top10Policy: {
      require: [/组织发展|组织效能|组织管理|组织诊断|组织架构|组织设计|编制|岗位价值|岗位评估|岗位称重|岗位管理|人效|od\b|咨询/i],
      reject: [/hrbp|business partner|业务伙伴|培训|学习发展|企业大学|招聘|员工关系|行政/i],
      allowRejectWhen: /组织诊断|组织架构|组织设计|组织治理|组织效能|编制|岗位价值|岗位评估|岗位称重|岗位管理|人效|KPMG|咨询/i,
    },
  },
  {
    name: "依视路 Commercial HRBP",
    projectId: process.env.POLICY_EVAL_ESSILOR_PROJECT_ID || "cmpjvl4ps005owc7wn34p63jd",
    codexJudgments: [],
    top10Policy: {
      require: [/hr|human|人力|人事|组织|人才/i, /hrbp|business partner|commercial|sales|销售|渠道|经销|人力资源合作伙伴|hr manager/i],
      reject: [/战略|策略|商分|商业分析|经营分析|国家负责人|品类负责人/i],
    },
  },
  {
    name: "名气家 HRVP",
    projectId: process.env.POLICY_EVAL_HRVP_PROJECT_ID || "cmpjvlvb0008mwc7wg3gfuwwm",
    codexJudgments: [],
    top10Policy: {
      require: [/hr|human|人力|人事|人才|cho|chro/i],
      reject: [/战略|策略|商分|商业分析|经营分析|国家负责人|品类负责人/i],
    },
  },
  {
    name: "算力采购经理",
    projectId: process.env.POLICY_EVAL_GPU_PROCUREMENT_PROJECT_ID || "cmpjzvsrs000mwcjxx195q6r0",
    codexJudgments: [],
    top10Policy: {
      require: [/采购|procurement|供应链|supply chain|供应商|sourcing|vendor|物流|贸易|纳入/i],
      reject: [/hrbp|人力资源|人事|招聘|行政|秘书|总助|战略|策略|商分|商业分析|经营分析/i],
    },
  },
  {
    name: "KAILAS 欧美海外 BP Manager",
    projectId: process.env.POLICY_EVAL_KAILAS_OVERSEAS_BP_PROJECT_ID || "cmpk1ql610000wc5c1ju3uf9d",
    codexJudgments: [],
    top10Policy: {
      require: [/hrbp|business partner|人力资源|hr manager|海外|出海|跨文化|英文|合规|外派|bp/i],
      reject: [/行政|秘书|总助|战略|商分|商业分析|纯招聘|talent acquisition|ssc|薪酬核算/i],
    },
  },
  {
    name: "KAILAS 电商 BP Leader",
    projectId: process.env.POLICY_EVAL_KAILAS_ECOM_BP_PROJECT_ID || "cmpk1s59h0038wc5c7iss8be4",
    codexJudgments: [],
    top10Policy: {
      require: [/hrbp|business partner|人力资源|hr manager|电商|直播|运营|投手|大促|私域|bp/i],
      reject: [/行政|秘书|总助|战略|商分|商业分析|纯招聘|talent acquisition|ssc|薪酬核算/i],
    },
  },
  {
    name: "KAILAS 用户中心 HRBP",
    projectId: process.env.POLICY_EVAL_KAILAS_USER_BP_PROJECT_ID || "cmpk1toil006cwc5co5gd2wt6",
    codexJudgments: [],
    top10Policy: {
      require: [/hrbp|business partner|人力资源|hr manager|用户|客服|会员|私域|培训|体验|bp/i],
      reject: [/行政|秘书|总助|战略|商分|商业分析|纯招聘|talent acquisition|ssc|薪酬核算/i],
    },
  },
  {
    name: "UCloud 算力采购/采销一体",
    projectId: process.env.POLICY_EVAL_UCLOUD_PROCUREMENT_PROJECT_ID || "cmpk1jaie0000wc6inw9i0amf",
    codexJudgments: [],
    top10Policy: {
      require: [/采购|采销|procurement|供应链|供应商|sourcing|vendor|算力|gpu|服务器|租赁|贸易/i],
      reject: [/hrbp|人力资源|人事|招聘|行政|秘书|总助|战略|策略|商分|商业分析|经营分析/i],
    },
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

function rowText(row, { includePolicyTrace = true } = {}) {
  const functionPath = /人力\/行政|人力资源/.test(row.functionPath || "") ? String(row.functionPath || "").replace(/行政/g, "") : row.functionPath;
  const parts = [
    row.name,
    row.company,
    row.title,
    functionPath,
    row.reasons.join(" "),
    row.concerns.join(" "),
    row.scenarioEvidence.join(" "),
    row.talentDbInsights.join(" "),
  ];
  if (includePolicyTrace) parts.push(row.policyTrace.join(" "));
  return parts
    .filter(Boolean)
    .join(" ");
}

function matches(row, matcher) {
  if (matcher.name && row.name !== matcher.name) return false;
  if (matcher.companyIncludes && !String(row.company || "").includes(matcher.companyIncludes)) return false;
  if (matcher.titleIncludes && !String(row.title || "").includes(matcher.titleIncludes)) return false;
  return true;
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 300)}`);
  }
  return response.json();
}

async function loadRows(projectId) {
  await fetchJson(`${baseUrl}/api/projects/${projectId}/longlist/scan`, { method: "POST" });
  const payload = await fetchJson(`${baseUrl}/api/projects/${projectId}`);
  return {
    project: payload.project,
    rows: (payload.project?.candidates || [])
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
          advisorTier: snapshot.advisorTier || "",
          reasons: snapshot.matchReasons || [],
          concerns: snapshot.matchConcerns || [],
          scenarioEvidence: snapshot.scenarioEvidence || [],
          talentDbInsights: snapshot.talentDbInsights || [],
          policyTrace: snapshot.policyTrace || [],
        };
      })
      .sort((a, b) => b.score - a.score),
  };
}

function runJudgment(rows, judgment) {
  const scope = rows.slice(0, judgment.n || rows.length);
  if (judgment.type === "topNInclude") return scope.some((row) => matches(row, judgment.match));
  if (judgment.type === "topNExclude") return !scope.some((row) => matches(row, judgment.match));
  if (judgment.type === "longlistExclude") return !rows.some((row) => matches(row, judgment.match));
  throw new Error(`Unknown judgment type: ${judgment.type}`);
}

function top10PolicyScore(rows, top10Policy) {
  const top = rows.slice(0, 10);
  const details = top.map((row, index) => {
    const requireText = rowText(row, { includePolicyTrace: true });
    const rejectText = rowText(row, { includePolicyTrace: false });
    const requirePass = top10Policy.require.every((pattern) => pattern.test(requireText));
    const rejectPass =
      top10Policy.reject.every((pattern) => !pattern.test(rejectText)) ||
      Boolean(top10Policy.allowRejectWhen && top10Policy.allowRejectWhen.test(requireText));
    return {
      rank: index + 1,
      name: row.name,
      company: row.company,
      title: row.title,
      score: row.score,
      gate: row.gate,
      valid: requirePass && rejectPass,
      requirePass,
      rejectPass,
    };
  });
  const validCount = details.filter((row) => row.valid).length;
  return {
    validCount,
    total: top.length,
    precision: top.length ? validCount / top.length : 0,
    invalidRows: details.filter((row) => !row.valid),
    details,
  };
}

const results = [];
let explicitPassed = 0;
let explicitTotal = 0;
let weightedPolicyValid = 0;
let weightedPolicyTotal = 0;

for (const testCase of cases) {
  try {
    const { project, rows } = await loadRows(testCase.projectId);
    const judgmentResults = testCase.codexJudgments.map((judgment) => ({
      name: judgment.name,
      passed: runJudgment(rows, judgment),
    }));
    explicitPassed += judgmentResults.filter((item) => item.passed).length;
    explicitTotal += judgmentResults.length;

    const policyScore = top10PolicyScore(rows, testCase.top10Policy);
    weightedPolicyValid += policyScore.validCount;
    weightedPolicyTotal += policyScore.total;

    results.push({
      name: testCase.name,
      projectName: project?.name,
      longlistCount: rows.length,
      explicitPassed: judgmentResults.filter((item) => item.passed).length,
      explicitTotal: judgmentResults.length,
      top10Precision: policyScore.precision,
      invalidRows: policyScore.invalidRows,
      top10: policyScore.details,
      judgmentResults,
    });
  } catch (error) {
    results.push({
      name: testCase.name,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

console.log("\nAgent vs Codex accuracy replay\n");
for (const result of results) {
  console.log(result.name);
  if (result.error) {
    console.log(`  FAIL ${result.error}`);
    continue;
  }
  console.log(`  project: ${result.projectName}`);
  console.log(`  longlist: ${result.longlistCount}`);
  if (result.explicitTotal) {
    console.log(`  Codex labeled sample accuracy: ${result.explicitPassed}/${result.explicitTotal}`);
    for (const judgment of result.judgmentResults) {
      console.log(`    ${judgment.passed ? "PASS" : "FAIL"} ${judgment.name}`);
    }
  } else {
    console.log("  Codex labeled sample accuracy: n/a");
  }
  console.log(`  Top10 policy precision proxy: ${result.top10Precision.toFixed(2)} (${Math.round(result.top10Precision * 100)}%)`);
  console.table(
    result.top10.slice(0, 10).map((row) => ({
      rank: row.rank,
      name: row.name,
      company: row.company,
      title: row.title,
      score: row.score,
      gate: row.gate,
      valid: row.valid,
    })),
  );
  if (result.invalidRows.length) {
    console.log("  Invalid / needs judge:");
    for (const row of result.invalidRows.slice(0, 5)) {
      console.log(`    #${row.rank} ${row.name || "未命名"} / ${row.company || "未填公司"} / ${row.title || "未填职位"}`);
    }
  }
  console.log("");
}

const explicitAccuracy = explicitTotal ? explicitPassed / explicitTotal : 1;
const policyPrecision = weightedPolicyTotal ? weightedPolicyValid / weightedPolicyTotal : 0;
const failedCases = results.filter((result) => result.error).length;

console.log("Summary");
console.log(`  replayed cases: ${results.length}`);
console.log(`  failed cases: ${failedCases}`);
console.log(`  explicit Codex-labeled sample accuracy: ${explicitPassed}/${explicitTotal} (${Math.round(explicitAccuracy * 100)}%)`);
console.log(`  weighted Top10 policy precision proxy: ${weightedPolicyValid}/${weightedPolicyTotal} (${Math.round(policyPrecision * 100)}%)`);

if (failedCases || explicitAccuracy < 1 || policyPrecision < 0.9) {
  process.exitCode = 1;
}
