import { createReadStream, existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = dirname(scriptDir);

const reportPath = join(appRoot, "data", "persol-report-data.json");
const indexPath = join(appRoot, "data", "persol-profile-index.json");

// ─── Command line args ──────────────────────────────────────────────────────

const inputDir = process.argv[2];
if (!inputDir || !existsSync(inputDir)) {
  console.error("Usage: node scripts/merge-persol-incremental.mjs <new_export_directory_path>");
  process.exit(1);
}

const listPath = join(inputDir, "candidate_list.jsonl");
const detailPath = join(inputDir, "candidate_detail_bulk.jsonl");
const deepPath = join(inputDir, "candidate_deep.jsonl");

console.log(`Incremental source directory: ${inputDir}`);
console.log(`Checking files:`);
console.log(`  List: ${listPath} (${existsSync(listPath) ? "exists" : "missing"})`);
console.log(`  Detail: ${detailPath} (${existsSync(detailPath) ? "exists" : "missing"})`);
console.log(`  Deep: ${deepPath} (${existsSync(deepPath) ? "exists" : "missing"})`);

// ─── Core helpers copied from build scripts for self-containment ─────────────

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

function countRefs(value) {
  return Array.isArray(value) ? value.length : 0;
}

async function readJsonl(path, onRecord) {
  if (!existsSync(path)) return;
  const rl = createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    onRecord(JSON.parse(trimmed));
  }
}

// ─── Build deep profile for candidate ────────────────────────────────────────

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

// ─── Execution ──────────────────────────────────────────────────────────────

async function main() {
  // 1. Read existing report data
  let existingReport = { metadata: { total: 0 }, records: [] };
  if (existsSync(reportPath)) {
    try {
      existingReport = JSON.parse(readFileSync(reportPath, "utf8"));
      console.log(`Loaded ${existingReport.records.length} existing report records.`);
    } catch (e) {
      console.warn("Could not parse existing report data, starting fresh.", e);
    }
  }
  const reportById = new Map(existingReport.records.map((r) => [r.id, r]));

  // 2. Load incoming detail records
  const newDetailById = new Map();
  await readJsonl(detailPath, (record) => {
    newDetailById.set(record.id, {
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
  console.log(`Read ${newDetailById.size} new details.`);

  // 3. Process new candidate lists and merge into report Map
  let newRecordsCount = 0;
  let updatedRecordsCount = 0;

  await readJsonl(listPath, (record) => {
    const detail = newDetailById.get(record.id) ?? {};
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

    // Governance computations
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

    const existing = reportById.get(record.id);
    if (!existing) {
      reportById.set(record.id, merged);
      newRecordsCount++;
    } else {
      // Compare lastUpdateDate
      const existingDate = parseDate(existing.lastUpdateDate || existing.lastContactDate) || new Date(0);
      const incomingDate = parseDate(merged.lastUpdateDate || merged.lastContactDate) || new Date(0);
      if (incomingDate >= existingDate) {
        reportById.set(record.id, { ...existing, ...merged });
        updatedRecordsCount++;
      }
    }
  });

  console.log(`Merged lists: ${newRecordsCount} new records, ${updatedRecordsCount} updated records.`);

  // 4. Update deep profiles
  let existingIndex = { profiles: [] };
  if (existsSync(indexPath)) {
    try {
      existingIndex = JSON.parse(readFileSync(indexPath, "utf8"));
    } catch (e) {
      console.warn("Could not parse existing index, starting fresh.", e);
    }
  }
  const profilesById = new Map(existingIndex.profiles.map((p) => [p.id, p]));

  let newProfilesCount = 0;
  let updatedProfilesCount = 0;

  await readJsonl(deepPath, (record) => {
    if (typeof record.id !== "number") return;
    const profile = profileFrom(record);

    const existing = profilesById.get(record.id);
    if (!existing) {
      profilesById.set(record.id, profile);
      newProfilesCount++;
    } else {
      // For deep profile, we just merge collections safely
      const mergedProfile = {
        ...existing,
        ...profile,
        experiences: [...existing.experiences],
        educations: [...existing.educations],
        projects: [...existing.projects],
        attachments: [...existing.attachments],
        jobSubmissions: [...existing.jobSubmissions],
      };
      mergeByMeaning(mergedProfile.experiences, profile.experiences, ["company", "title", "period", "description"]);
      mergeByMeaning(mergedProfile.educations, profile.educations, ["school", "major", "degree", "period"]);
      mergeByMeaning(mergedProfile.projects, profile.projects, ["name", "role", "period", "description"]);
      mergeByMeaning(mergedProfile.attachments, profile.attachments, ["name", "category", "ext", "filesize"]);
      mergeByMeaning(mergedProfile.jobSubmissions, profile.jobSubmissions, ["jobTitle", "clientName", "status", "dateAdded"]);

      profilesById.set(record.id, mergedProfile);
      updatedProfilesCount++;
    }
  });

  console.log(`Merged deep profiles: ${newProfilesCount} new profiles, ${updatedProfilesCount} updated profiles.`);

  // 5. Save index profiles
  const finalProfiles = [...profilesById.values()];
  writeFileSync(
    indexPath,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      total: finalProfiles.length,
      profiles: finalProfiles,
    }, null, 2)
  );

  // 6. Save report data and update metadata
  const finalRecords = [...reportById.values()];

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
    sourceDir: inputDir,
    total: finalRecords.length,
    withNotes: finalRecords.filter((r) => r.hasNotes).length,
    withEmail: finalRecords.filter((r) => r.email).length,
    withMobile: finalRecords.filter((r) => r.mobile).length,
    withDeepDetail: finalProfiles.length,
    topCompanies: topCounts(finalRecords.map((r) => r.companyName)),
    topTitles: topCounts(finalRecords.map((r) => r.title)),
    sources: topCounts(finalRecords.map((r) => r.source), 30),
    statuses: topCounts(finalRecords.map((r) => r.status), 30),
    functionPaths: topCounts(finalRecords.map((r) => r.functionPath), 30),
  };

  writeFileSync(
    reportPath,
    JSON.stringify({ metadata, records: finalRecords }, null, 2)
  );

  console.log(`✅ Success! Incremental merge complete. Total records: ${finalRecords.length}, Deep profiles: ${finalProfiles.length}`);
}

main().catch((err) => {
  console.error("Incremental merge failed:", err);
  process.exit(1);
});
