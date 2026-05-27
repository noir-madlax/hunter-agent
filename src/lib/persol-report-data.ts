import { createReadStream, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";

export type PersolCandidateRecord = {
  id: number;
  name: string;
  chineseName: string;
  englishName: string;
  companyName: string;
  title: string;
  firstExperienceTitle: string;
  functionPath: string;
  functionTags: string[];
  mobile: string;
  email: string;
  age: number | null;
  gender: string;
  annualSalary: number | null;
  expectedSalary: string;
  compensationDetail: string;
  lastContactDate: string;
  lastUpdateDate: string;
  lastStatusDate: string;
  dateAdded: string;
  source: string;
  status: string;
  consultantRank: string;
  owner: number | null;
  addedBy: number | null;
  companyId: number | null;
  functionCodes: Array<number | string>;
  cityCodes: Array<number | string>;
  locationCodes: Array<number | string>;
  industryCodes: Array<number | string>;
  educationCount: number;
  experienceCount: number;
  projectCount: number;
  languageCount: number;
  skillCount: number;
  notes: string[];
  hasNotes: boolean;
  deepProfileText?: string;
  searchText: string;
  annualSalaryRaw: number | null;
  dataQuality: {
    issues: string[];
    issueCount: number;
    hasJunkCompany: boolean;
    hasInvalidTitle: boolean;
    hasSuspiciousSalary: boolean;
    isStale: boolean;
    noIdentity: boolean;
  };
  logUpdateDate?: string;
  governedSalary?: {
    rawText: string;
    annualizedTotal: number | null;
    base: {
      monthly: number;
      months: number;
      annualizedBase: number;
    } | null;
    bonus: {
      rawText: string;
      annualizedBonus: number;
    } | null;
    equity: {
      rawText: string;
      type: "options" | "rsu" | "shares" | null;
      totalValue: number | null;
      vestingYears: number | null;
      annualizedValue: number | null;
      percentage: number | null;
    } | null;
  } | null;
  governedNotes?: {
    timeline: Array<{
      id: number | string;
      dateAdded: string;
      category: string;
      rawCategory: string;
      content: string;
    }>;
    seekingStatus: "active" | "passive" | "unknown";
    extractedTags: string[];
  } | null;
};

export type PersolReportMetadata = {
  generatedAt: string;
  sourceDir: string;
  total: number;
  withNotes: number;
  withEmail: number;
  withMobile: number;
  withDeepDetail: number;
  topCompanies: CountOption[];
  topTitles: CountOption[];
  sources: CountOption[];
  statuses: CountOption[];
  functionPaths: CountOption[];
};

export type CountOption = {
  label: string;
  count: number;
};

export type PersolReportData = {
  metadata: PersolReportMetadata;
  records: PersolCandidateRecord[];
};

export type CandidateSearchParams = {
  q?: string;
  page?: number;
  pageSize?: number;
  source?: string;
  status?: string;
  hasNotes?: string;
  minAge?: number;
  maxAge?: number;
  sort?: "lastUpdateDate" | "lastContactDate" | "dateAdded" | "age" | "name";
  order?: "asc" | "desc";
};

export type CandidateSearchResult = {
  metadata: PersolReportMetadata;
  records: Array<Omit<PersolCandidateRecord, "searchText">>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  matchedSummary: {
    withNotes: number;
    withEmail: number;
    withMobile: number;
    sources: CountOption[];
    statuses: CountOption[];
  };
};

export type PersolCandidateProfile = {
  record: Omit<PersolCandidateRecord, "searchText">;
  rawList: Record<string, unknown> | null;
  rawDetail: Record<string, unknown> | null;
  rawDetailSource: string | null;
  deepProfile: PersolDeepProfile | null;
};

let cachedData: PersolReportData | null = null;
let cachedListRecords: Map<number, Record<string, unknown>> | null = null;
let cachedDetailRecords: Map<number, Record<string, unknown>> | null = null;
let cachedDeepProfiles: Map<number, PersolDeepProfile> | null = null;

export type PersolDeepProfile = {
  id: number;
  selfAssessment: string;
  attachments: Array<{
    id: number | string | null;
    name: string;
    category: string;
    source: string;
    ext: string;
    dateAdded: string;
    filesize: number | null;
  }>;
  jobSubmissions: Array<{
    id: number | string | null;
    jobTitle: string;
    clientName: string;
    status: string;
    dateAdded: string;
    lastUpdateDate: string;
  }>;
  experiences: Array<{
    id: number | string | null;
    company: string;
    title: string;
    period: string;
    description: string;
  }>;
  educations: Array<{
    id: number | string | null;
    school: string;
    major: string;
    degree: string;
    period: string;
  }>;
  projects: Array<{
    id: number | string | null;
    name: string;
    role: string;
    period: string;
    description: string;
  }>;
  candidateMeta: {
    address: string;
    workStart: string;
    highestEducationRef: string;
    currentSalary: string;
    expectedSalary: string;
    positionStatus: string;
  };
  governedExperiences?: Array<{
    id: number | string | null;
    company: string;
    title: string;
    period: string;
    description: string;
  }> | null;
};

function dataPath() {
  return join(process.cwd(), "data", "persol-report-data.json");
}

function deepIndexPath() {
  return join(process.cwd(), "data", "persol-profile-index.json");
}

function exportDataDir() {
  const candidates = [
    process.env.PERSOL_EXPORT_DIR,
    join(process.cwd(), "..", "persol-export-20260523-hr-admin-full"),
    join(process.cwd(), "persol-export-20260523-hr-admin-full"),
    join(process.cwd(), "data", "persol-export-20260523-hr-admin-full"),
  ].filter((value): value is string => Boolean(value));

  return candidates.map((candidate) => resolve(candidate)).find((candidate) => existsSync(candidate)) ?? resolve(candidates[0]);
}

function exportDataPath(fileName: string) {
  return join(exportDataDir(), fileName);
}

function compactText(values: Array<string | number | null | undefined>, limit = 12000) {
  return values
    .filter((value) => value !== null && value !== undefined && value !== "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function findJsonlRecordById(fileName: string, id: number) {
  const filePath = exportDataPath(fileName);
  if (!existsSync(filePath)) return null;

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = JSON.parse(trimmed) as unknown;
    if (!isObjectRecord(parsed)) continue;
    if (parsed.id === id) {
      rl.close();
      return parsed;
    }
  }

  return null;
}

const MAX_CACHE_SIZE = 500;

async function getCandidateDetailRecord(id: number) {
  if (!cachedDetailRecords) cachedDetailRecords = new Map<number, Record<string, unknown>>();
  if (cachedDetailRecords.has(id)) return cachedDetailRecords.get(id) ?? null;

  const record = await findJsonlRecordById("candidate_detail_bulk.jsonl", id);
  if (record) {
    if (cachedDetailRecords.size >= MAX_CACHE_SIZE) {
      const firstKey = cachedDetailRecords.keys().next().value;
      if (firstKey !== undefined) cachedDetailRecords.delete(firstKey);
    }
    cachedDetailRecords.set(id, record);
  }
  return record;
}

async function getCandidateListRecord(id: number) {
  if (!cachedListRecords) cachedListRecords = new Map<number, Record<string, unknown>>();
  if (cachedListRecords.has(id)) return cachedListRecords.get(id) ?? null;

  const record = await findJsonlRecordById("candidate_list.jsonl", id);
  if (record) {
    if (cachedListRecords.size >= MAX_CACHE_SIZE) {
      const firstKey = cachedListRecords.keys().next().value;
      if (firstKey !== undefined) cachedListRecords.delete(firstKey);
    }
    cachedListRecords.set(id, record);
  }
  return record;
}

async function getCandidateDeepProfiles() {
  if (cachedDeepProfiles) return cachedDeepProfiles;

  const deepProfiles = new Map<number, PersolDeepProfile>();
  try {
    const file = await readFile(deepIndexPath(), "utf8");
    const parsed = JSON.parse(file) as { profiles?: PersolDeepProfile[] };
    for (const profile of parsed.profiles ?? []) {
      if (typeof profile.id === "number") deepProfiles.set(profile.id, profile);
    }
  } catch {
    // Deep profile index is optional so older deployments can still serve candidate snapshots.
  }

  cachedDeepProfiles = deepProfiles;
  return cachedDeepProfiles;
}

function deepProfileSearchText(profile: PersolDeepProfile | undefined) {
  if (!profile) return "";

  return compactText(
    [
      profile.selfAssessment,
      ...profile.experiences.map((item) => `${item.company} ${item.title} ${item.period} ${item.description}`),
      ...profile.educations.map((item) => `${item.school} ${item.major} ${item.degree} ${item.period}`),
      ...profile.projects.map((item) => `${item.name} ${item.role} ${item.period} ${item.description}`),
      ...profile.jobSubmissions.map((item) => `${item.jobTitle} ${item.clientName} ${item.status}`),
      ...profile.attachments.map((item) => item.name),
      profile.candidateMeta.address,
      profile.candidateMeta.workStart,
      profile.candidateMeta.currentSalary,
      profile.candidateMeta.expectedSalary,
      profile.candidateMeta.positionStatus,
    ],
    16000,
  );
}

export async function getPersolReportData() {
  if (cachedData) return cachedData;

  let file: string;
  try {
    file = await readFile(dataPath(), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        metadata: {
          generatedAt: new Date().toISOString(),
          sourceDir: "",
          total: 0,
          withNotes: 0,
          withEmail: 0,
          withMobile: 0,
          withDeepDetail: 0,
          topCompanies: [],
          topTitles: [],
          sources: [],
          statuses: [],
          functionPaths: [],
        },
        records: [],
      };
    }
    throw err;
  }

  const parsed = JSON.parse(file) as PersolReportData;
  const deepProfiles = await getCandidateDeepProfiles();
  parsed.records = parsed.records.map((record) => {
    const deepProfileText = deepProfileSearchText(deepProfiles.get(record.id));
    return {
      ...record,
      annualSalaryRaw: record.annualSalaryRaw !== undefined ? record.annualSalaryRaw : record.annualSalary,
      dataQuality: record.dataQuality || {
        issues: [],
        issueCount: 0,
        hasJunkCompany: false,
        hasInvalidTitle: false,
        hasSuspiciousSalary: false,
        isStale: false,
        noIdentity: false,
      },
      deepProfileText,
      searchText: compactText([
        record.id,
        record.name,
        record.chineseName,
        record.englishName,
        record.companyName,
        record.title,
        record.firstExperienceTitle,
        record.functionPath,
        record.mobile,
        record.email,
        record.expectedSalary,
        record.source,
        record.status,
        record.functionCodes.join(" "),
        record.cityCodes.join(" "),
        record.industryCodes.join(" "),
        record.notes.join(" "),
        record.governedNotes?.extractedTags ? record.governedNotes.extractedTags.join(" ") : "",
        deepProfileText,
      ], 24000).toLowerCase(),
    };
  });
  cachedData = parsed;
  return cachedData;
}

export async function getPersolCandidateProfile(id: number): Promise<PersolCandidateProfile | null> {
  const { records } = await getPersolReportData();
  const record = records.find((item) => item.id === id);
  if (!record) return null;

  const { searchText, ...summary } = record;
  void searchText;

  const rawDetail = await getCandidateDetailRecord(id);
  const rawList = await getCandidateListRecord(id);
  const deepProfiles = await getCandidateDeepProfiles();

  return {
    record: summary,
    rawList,
    rawDetail,
    rawDetailSource: rawDetail ? exportDataPath("candidate_detail_bulk.jsonl") : null,
    deepProfile: deepProfiles.get(id) ?? null,
  };
}

function normalizeQuery(value: string | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function dateValue(value: string) {
  const time = Date.parse(value.replace(" ", "T"));
  return Number.isFinite(time) ? time : 0;
}

function topCounts(records: PersolCandidateRecord[], key: "source" | "status", limit = 12) {
  const counts = new Map<string, number>();
  for (const record of records) {
    const label = record[key] || "未填";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function stripSearchText(record: PersolCandidateRecord) {
  const { searchText, ...rest } = record;
  void searchText;
  return rest;
}

export async function searchPersolCandidates(params: CandidateSearchParams): Promise<CandidateSearchResult> {
  const { metadata, records } = await getPersolReportData();
  const tokens = normalizeQuery(params.q);
  const pageSize = Math.min(Math.max(params.pageSize ?? 25, 10), 100);
  const page = Math.max(params.page ?? 1, 1);

  let filtered = records.filter((record) => {
    if (tokens.length && !tokens.every((token) => record.searchText.includes(token))) return false;
    if (params.source && record.source !== params.source) return false;
    if (params.status && record.status !== params.status) return false;
    if (params.hasNotes === "yes" && !record.hasNotes) return false;
    if (params.hasNotes === "no" && record.hasNotes) return false;
    if (typeof params.minAge === "number" && (record.age === null || record.age < params.minAge)) return false;
    if (typeof params.maxAge === "number" && (record.age === null || record.age > params.maxAge)) return false;
    return true;
  });

  const sort = params.sort ?? "lastUpdateDate";
  const order = params.order ?? "desc";
  filtered = [...filtered].sort((a, b) => {
    let result = 0;
    if (sort === "age") {
      result = (a.age ?? -1) - (b.age ?? -1);
    } else if (sort === "name") {
      result = a.name.localeCompare(b.name, "zh-CN");
    } else {
      result = dateValue(a[sort]) - dateValue(b[sort]);
    }
    return order === "asc" ? result : -result;
  });

  const total = filtered.length;
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const start = (Math.min(page, totalPages) - 1) * pageSize;
  const pageRecords = filtered.slice(start, start + pageSize).map(stripSearchText);

  return {
    metadata,
    records: pageRecords,
    total,
    page: Math.min(page, totalPages),
    pageSize,
    totalPages,
    matchedSummary: {
      withNotes: filtered.filter((record) => record.hasNotes).length,
      withEmail: filtered.filter((record) => record.email).length,
      withMobile: filtered.filter((record) => record.mobile).length,
      sources: topCounts(filtered, "source"),
      statuses: topCounts(filtered, "status"),
    },
  };
}
