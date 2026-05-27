import { createReadStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = dirname(scriptDir);
const workspaceRoot = dirname(appRoot);
const exportDir = join(workspaceRoot, "persol-export-20260523-hr-admin-full");
const deepPath = join(exportDir, "candidate_deep.jsonl");
const listPath = join(exportDir, "candidate_list.jsonl");
const relationPath = join(exportDir, "candidate_relation_bulk.jsonl");
const outputPath = join(appRoot, "data", "persol-profile-index.json");

function safeText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    return safeText(value.__name__ ?? value.value ?? value.name ?? value.chineseName ?? value.englishName ?? value.title ?? value.id);
  }
  return String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function textBlock(value, limit = 6000) {
  return safeText(value).slice(0, limit);
}

function firstObject(items) {
  return Array.isArray(items) ? items.find((item) => item && typeof item === "object" && !Array.isArray(item)) : null;
}

function compactArray(value, limit = 20) {
  return Array.isArray(value) ? value.filter(Boolean).slice(0, limit) : [];
}

function optionName(value) {
  return safeText(value);
}

function candidateFrom(record) {
  const submissionCandidate = compactArray(record.jobsubmissions?.list, 5).find((item) => item?.candidate)?.candidate;
  return record.detail?.candidate ?? record.detail ?? submissionCandidate ?? null;
}

function periodOf(item) {
  return [
    item.startDate,
    item.start_date,
    item.dateFrom,
    item.from,
    item.beginDate,
    item.endDate,
    item.end_date,
    item.dateTo,
    item.to,
    item.finishDate,
  ]
    .map(safeText)
    .filter(Boolean)
    .join(" - ");
}

function experienceOf(item) {
  return {
    id: item.id ?? null,
    company: safeText(item.company ?? item.client ?? item.companyName ?? item.clientName),
    title: safeText(item.title ?? item.__name__),
    period: periodOf(item),
    description: textBlock(item.description ?? item.responsibility ?? item.achievement ?? item.note ?? item.summary, 1800),
  };
}

function educationOf(item) {
  return {
    id: item.id ?? null,
    school: safeText(item.school ?? item.school_name ?? item.university ?? item.college ?? item.__name__),
    major: safeText(item.major ?? item.speciality ?? item.discipline),
    degree: optionName(item.degree ?? item.education ?? item.education_level),
    period: periodOf(item),
  };
}

function projectOf(item) {
  return {
    id: item.id ?? null,
    name: safeText(item.name ?? item.project ?? item.project_name ?? item.title ?? item.__name__),
    role: safeText(item.role ?? item.title ?? item.duty),
    period: periodOf(item),
    description: textBlock(item.description ?? item.responsibility ?? item.achievement ?? item.note ?? item.summary, 1800),
  };
}

function mergeByMeaning(existing, incoming, keys) {
  const seen = new Set(existing.map((item) => keys.map((key) => safeText(item[key])).join("|")));
  for (const item of incoming) {
    const signature = keys.map((key) => safeText(item[key])).join("|");
    if (!signature.replace(/\|/g, "") || seen.has(signature)) continue;
    existing.push(item);
    seen.add(signature);
  }
}

function meaningfulLine(values) {
  return values.some((value) => safeText(value));
}

function profileFrom(record) {
  const candidate = candidateFrom(record) ?? {};
  const submissions = compactArray(record.jobsubmissions?.list, 20).map((item) => ({
    id: item.id ?? null,
    jobTitle: safeText(item.joborder?.__name__ ?? item.joborder?.title ?? item.position?.__name__ ?? item.position?.title),
    clientName: safeText(item.joborder?.client?.__name__ ?? item.joborder?.client?.name ?? item.client?.__name__ ?? item.client?.name),
    status: safeText(item.mark ?? item.status ?? item.source),
    dateAdded: safeText(item.dateAdded),
    lastUpdateDate: safeText(item.lastUpdateDate),
  }));

  const experiences = compactArray(candidate.candidateexperience_set, 20)
    .filter((item) => typeof item === "object")
    .map(experienceOf)
    .filter((item) => meaningfulLine([item.company, item.title, item.period, item.description]));

  const educations = compactArray(candidate.candidateeducation_set, 20)
    .filter((item) => typeof item === "object")
    .map(educationOf)
    .filter((item) => meaningfulLine([item.school, item.major, item.degree, item.period]));

  const projects = compactArray(candidate.candidateproject_set, 20)
    .filter((item) => typeof item === "object")
    .map(projectOf)
    .filter((item) => meaningfulLine([item.name, item.role, item.period, item.description]));

  const attachments = compactArray(record.files, 20).map((file) => ({
    id: file.id ?? null,
    name: safeText(file.originname ?? file.__name__),
    category: safeText(file.tag),
    source: safeText(file.source),
    ext: safeText(file.ext),
    dateAdded: safeText(file.dateAdded),
    filesize: typeof file.filesize === "number" ? file.filesize : null,
  }));

  const selfAssessment = textBlock(candidate.built_in_self_assessment);
  const firstSubmissionCandidate = firstObject(record.jobsubmissions?.list)?.candidate ?? {};

  return {
    id: record.id,
    selfAssessment,
    attachments,
    jobSubmissions: submissions.filter((item) => meaningfulLine([item.jobTitle, item.clientName, item.status, item.dateAdded])),
    experiences,
    educations,
    projects,
    candidateMeta: {
      address: safeText(candidate.address ?? firstSubmissionCandidate.address),
      workStart: safeText(candidate.work_start ?? firstSubmissionCandidate.work_start),
      highestEducationRef: safeText(candidate.highest_education ?? firstSubmissionCandidate.highest_education),
      currentSalary: safeText(candidate.current_salary ?? firstSubmissionCandidate.current_salary),
      expectedSalary: safeText(candidate.expected_salary ?? firstSubmissionCandidate.expected_salary),
      positionStatus: safeText(candidate.position_status ?? firstSubmissionCandidate.position_status),
    },
  };
}

async function readJsonlIfExists(filePath, onRecord) {
  if (!existsSync(filePath)) return;

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    onRecord(JSON.parse(trimmed));
  }
}

function relationClientName(record, clientId) {
  const clients = Array.isArray(record.clients) ? record.clients : [];
  const client = clients.find((item) => item?.id === clientId);
  return safeText(client?.__name__ ?? client?.name);
}

function normalizeRelationRecord(record) {
  const candidateId = Number(record.id);
  if (!Number.isFinite(candidateId)) return null;

  const experiences = compactArray(record.experiences, 50)
    .map((item) => experienceOf({ ...item, company: item.company || relationClientName(record, item.client) }))
    .filter((item) => meaningfulLine([item.company, item.title, item.period, item.description]));
  const educations = compactArray(record.educations, 30)
    .map(educationOf)
    .filter((item) => meaningfulLine([item.school, item.major, item.degree, item.period]));
  const projects = compactArray(record.projects, 30)
    .map(projectOf)
    .filter((item) => meaningfulLine([item.name, item.role, item.period, item.description]));

  return { id: candidateId, experiences, educations, projects };
}

const relationByCandidate = new Map();
await readJsonlIfExists(relationPath, (record) => {
  const normalized = normalizeRelationRecord(record);
  if (normalized) relationByCandidate.set(normalized.id, normalized);
});

const firstExperienceByCandidate = new Map();
await readJsonlIfExists(listPath, (record) => {
  if (typeof record.id !== "number" || !record.firstExperience) return;
  firstExperienceByCandidate.set(record.id, {
    id: record.firstExperience.id ?? null,
    company: safeText(record.company_name || record.company?.name),
    title: safeText(record.firstExperience.title || record.firstExperience.__name__),
    period: "",
    description: safeText(record.firstExperience.function_normal_v8 || record.firstExperience.function_normal),
  });
});

const profiles = [];
const rl = createInterface({
  input: createReadStream(deepPath, { encoding: "utf8" }),
  crlfDelay: Infinity,
});

let total = 0;
for await (const line of rl) {
  const trimmed = line.trim();
  if (!trimmed) continue;
  total += 1;
  const record = JSON.parse(trimmed);
  if (typeof record.id !== "number") continue;
  const profile = profileFrom(record);
  const relation = relationByCandidate.get(record.id);
  if (relation) {
    mergeByMeaning(profile.experiences, relation.experiences, ["company", "title", "period", "description"]);
    mergeByMeaning(profile.educations, relation.educations, ["school", "major", "degree", "period"]);
    mergeByMeaning(profile.projects, relation.projects, ["name", "role", "period", "description"]);
  }
  const firstExperience = firstExperienceByCandidate.get(record.id);
  if (firstExperience) mergeByMeaning(profile.experiences, [firstExperience], ["company", "title", "description"]);
  const hasMeaningfulContent =
    profile.selfAssessment ||
    profile.attachments.length ||
    profile.jobSubmissions.length ||
    profile.experiences.length ||
    profile.educations.length ||
    profile.projects.length ||
    Object.values(profile.candidateMeta).some(Boolean);
  if (hasMeaningfulContent) profiles.push(profile);
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(
  outputPath,
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    total,
    relationProfiles: relationByCandidate.size,
    firstExperienceProfiles: firstExperienceByCandidate.size,
    profiles,
  }),
);

console.log(`Wrote ${profiles.length}/${total} deep profiles to ${outputPath}`);
console.log(`Merged ${relationByCandidate.size} relation profiles and ${firstExperienceByCandidate.size} first-experience fallbacks.`);
