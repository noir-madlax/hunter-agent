import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = dirname(scriptDir);
const workspaceRoot = dirname(appRoot);
const exportDir = join(workspaceRoot, "persol-export-20260523-hr-admin-full");
const detailPath = join(exportDir, "candidate_detail_bulk.jsonl");
const listPath = join(exportDir, "candidate_list.jsonl");
const outputPath = join(appRoot, "data", "persol-report-data.json");

function safeText(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function compactArray(value) {
  return Array.isArray(value) ? value.filter((item) => item !== null && item !== undefined) : [];
}

function countRefs(value) {
  return Array.isArray(value) ? value.length : 0;
}

function genderLabel(value) {
  if (value === true) return "男";
  if (value === false) return "女";
  return "未知";
}

const JUNK_COMPANY_PATTERNS = [
  /^公司（请不要修改）$/,
  /^未知公司/,
  /^未知\s*\d+$/,
  /^-\s*\d+$/,
  /^公司$/,
  /^无$/,
  /^DFF$/i,
];

function isJunkCompany(name) {
  if (!name) return true;
  return JUNK_COMPANY_PATTERNS.some((p) => p.test(name));
}

function normalizeSalary(value) {
  if (typeof value !== "number" || value <= 0) return null;
  if (value < 50000) return value * 12;
  if (value > 10000000) {
    const valDivided = value / 100;
    if (valDivided > 5000000) return null;
    return valDivided;
  }
  return value;
}

function parseDate(s) {
  if (!s) return null;
  const clean = String(s).trim().replace(" ", "T");
  const time = Date.parse(clean);
  if (Number.isFinite(time)) return new Date(time);
  return null;
}


function extractNotes(notes) {
  if (!Array.isArray(notes)) return [];

  return notes
    .map((note) => {
      const parts = Array.isArray(note.all_content)
        ? note.all_content
            .map((item) => {
              const label = safeText(item.label);
              const value = safeText(item.value);
              return label && value ? `${label}: ${value}` : value || label;
            })
            .filter(Boolean)
        : [];
      return parts.join(" | ").slice(0, 1200);
    })
    .filter(Boolean);
}

async function readJsonl(path, onRecord) {
  const rl = createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let lineNumber = 0;
  for await (const line of rl) {
    lineNumber += 1;
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      onRecord(JSON.parse(trimmed), lineNumber);
    } catch (error) {
      throw new Error(`Failed parsing ${path}:${lineNumber} ${error.message}`);
    }
  }
}

const detailById = new Map();

await readJsonl(detailPath, (record) => {
  detailById.set(record.id, {
    id: record.id,
    name: safeText(record.__name__ || record.chineseName || record.englishName),
    chineseName: safeText(record.chineseName),
    englishName: safeText(record.englishName),
    title: safeText(record.title),
    mobile: safeText(record.mobile),
    email: safeText(record.email),
    age: typeof record.age === "number" ? record.age : null,
    gender: genderLabel(record.gender),
    annualSalary: typeof record.annualSalary === "number" ? record.annualSalary : null,
    expectedSalary: safeText(record.expected_salary || record.hopeannual),
    compensationDetail: safeText(record.gllueextcurrentcompensationdetail),
    lastContactDate: safeText(record.lastContactDate),
    lastUpdateDate: safeText(record.lastUpdateDate),
    lastStatusDate: safeText(record.last_status_date),
    dateAdded: safeText(record.dateAdded),
    source: safeText(record.source),
    status: safeText(record.last_status),
    consultantRank: safeText(record.cmbConsultantRank),
    owner: record.owner ?? null,
    addedBy: record.addedBy ?? null,
    companyId: record.company ?? null,
    functionCodes: compactArray(record.functions),
    cityCodes: compactArray(record.citys),
    locationCodes: compactArray(record.locations),
    industryCodes: compactArray(record.industrys),
    educationCount: countRefs(record.candidateeducation_set),
    experienceCount: countRefs(record.candidateexperience_set),
    projectCount: countRefs(record.candidateproject_set),
    languageCount: countRefs(record.candidatelanguage_set),
    skillCount: countRefs(record.candidateskill_set),
  });
});

const records = [];

await readJsonl(listPath, (record) => {
  const detail = detailById.get(record.id) ?? {};
  const functionPath = safeText(record.firstExperience?.function_normal_v8);
  const notes = extractNotes(record.notes);
  const merged = {
    id: record.id,
    name: safeText(record.name || detail.name),
    chineseName: safeText(detail.chineseName || record.candidate?.chineseName),
    englishName: safeText(detail.englishName || record.candidate?.englishName),
    companyName: safeText(record.company_name || record.company?.name),
    title: safeText(record.title || detail.title),
    firstExperienceTitle: safeText(record.firstExperience?.title),
    functionPath,
    functionTags: functionPath ? functionPath.split("$").filter(Boolean) : [],
    mobile: safeText(record.mobile || detail.mobile),
    email: safeText(detail.email),
    age: detail.age ?? (typeof record.candidate?.age === "number" ? record.candidate.age : null),
    gender: detail.gender ?? genderLabel(record.candidate?.gender),
    annualSalary: detail.annualSalary ?? null,
    expectedSalary: safeText(detail.expectedSalary),
    compensationDetail: safeText(detail.compensationDetail),
    lastContactDate: safeText(record.lastContactDate || detail.lastContactDate),
    lastUpdateDate: safeText(record.lastUpdateDate || detail.lastUpdateDate),
    lastStatusDate: safeText(detail.lastStatusDate),
    dateAdded: safeText(detail.dateAdded),
    source: safeText(detail.source),
    status: safeText(detail.status),
    consultantRank: safeText(detail.consultantRank),
    owner: detail.owner ?? null,
    addedBy: detail.addedBy ?? null,
    companyId: detail.companyId ?? record.company?.id ?? null,
    functionCodes: detail.functionCodes ?? [],
    cityCodes: detail.cityCodes ?? [],
    locationCodes: detail.locationCodes ?? [],
    industryCodes: detail.industryCodes ?? [],
    educationCount: detail.educationCount ?? 0,
    experienceCount: detail.experienceCount ?? countRefs(record.candidate?.candidateexperience_set),
    projectCount: detail.projectCount ?? 0,
    languageCount: detail.languageCount ?? 0,
    skillCount: detail.skillCount ?? 0,
    notes,
    hasNotes: notes.length > 0,
  };

  const rawSalary = detail.annualSalary ?? null;
  const normalizedSalary = normalizeSalary(rawSalary);

  const issues = [];
  if (isJunkCompany(merged.companyName)) {
    issues.push(`垃圾公司名: ${JSON.stringify(merged.companyName)}`);
  }
  if (!merged.title || ["未知", "unknown", "-", "NULL", "null"].includes(merged.title)) {
    issues.push(`无效或缺失职位: ${JSON.stringify(merged.title)}`);
  }
  if (normalizedSalary === null && rawSalary !== null && rawSalary !== 0) {
    issues.push(`薪资数据异常/无法归一化: ${JSON.stringify(rawSalary)}`);
  }
  if (rawSalary !== null && (rawSalary < 0 || rawSalary > 10000000)) {
    issues.push(`薪资数据范围异常: ${JSON.stringify(rawSalary)}`);
  }
  if (!merged.email && !merged.mobile) {
    issues.push("没有任何联系方式");
  } else if (!merged.email) {
    issues.push("缺少邮箱");
  } else if (!merged.mobile) {
    issues.push("缺少电话");
  }

  const lastUpdate = merged.lastUpdateDate || merged.lastContactDate;
  if (lastUpdate) {
    const dt = parseDate(lastUpdate);
    if (dt) {
      const daysSince = Math.floor((Date.now() - dt.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince > 1825) {
        issues.push(`超过5年未更新 (最后更新: ${lastUpdate})`);
      }
    } else {
      issues.push(`无法解析的更新日期: ${JSON.stringify(lastUpdate)}`);
    }
  } else {
    issues.push("缺少更新日期");
  }

  if (!merged.title && !merged.functionPath) {
    issues.push("完全缺失职能信息 (no title & no functionPath)");
  }

  merged.annualSalary = normalizedSalary;
  merged.annualSalaryRaw = rawSalary;
  merged.dataQuality = {
    issues,
    issueCount: issues.length,
    hasJunkCompany: isJunkCompany(merged.companyName),
    hasInvalidTitle: !merged.title || ["未知", "unknown", "-", "NULL", "null"].includes(merged.title),
    hasSuspiciousSalary: normalizedSalary === null && rawSalary !== null && rawSalary !== 0,
    isStale: lastUpdate ? (parseDate(lastUpdate) ? (Date.now() - parseDate(lastUpdate).getTime() > 1825 * 24 * 60 * 60 * 1000) : true) : true,
    noIdentity: !merged.title && !merged.functionPath,
  };

  records.push(merged);
});

function topCounts(items, limit = 18) {
  const counts = new Map();
  for (const item of items) {
    if (!item) continue;
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), "zh-CN"))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

const metadata = {
  generatedAt: new Date().toISOString(),
  sourceDir: exportDir,
  total: records.length,
  withNotes: records.filter((record) => record.hasNotes).length,
  withEmail: records.filter((record) => record.email).length,
  withMobile: records.filter((record) => record.mobile).length,
  withDeepDetail: detailById.size,
  topCompanies: topCounts(records.map((record) => record.companyName)),
  topTitles: topCounts(records.map((record) => record.title)),
  sources: topCounts(records.map((record) => record.source), 30),
  statuses: topCounts(records.map((record) => record.status), 30),
  functionPaths: topCounts(records.map((record) => record.functionPath), 30),
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify({ metadata, records }));

console.log(`Wrote ${records.length} records to ${outputPath}`);
