import { readFileSync, writeFileSync, existsSync, createReadStream } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = dirname(scriptDir);

const reportPath = join(appRoot, "data", "persol-report-data.json");
const indexPath = join(appRoot, "data", "persol-profile-index.json");

// ─── Governance Helpers ─────────────────────────────────────────────────────

// Salary Parser
function parseCompensationDetail(detailText, annualSalaryRaw) {
  let monthlyBase = null;
  let months = 12;
  let annualizedBase = null;
  let annualizedBonus = null;
  let equityTotal = null;
  let equityVestingYears = null;
  let equityAnnualized = null;
  let equityPercentage = null;
  let equityType = null; // options / rsu / shares

  const clean = (detailText || "").trim();

  if (clean) {
    // 1. Try to extract monthly salary and months, e.g. "15K*14", "17k*13薪", "12000*15"
    const baseRegex = /(\d+(?:\.\d+)?)\s*(?:[Kk千万]|(?:000))?\s*[*×x]\s*(\d+)\s*(?:薪|[Mm月]?)/;
    const baseMatch = clean.match(baseRegex);
    if (baseMatch) {
      let baseVal = parseFloat(baseMatch[1]);
      const isWan = baseMatch[0].includes("万");
      const isK = baseMatch[0].includes("k") || baseMatch[0].includes("K") || baseMatch[0].includes("千");
      
      if (isWan) {
        monthlyBase = baseVal * 10000;
      } else if (isK || baseVal < 1000) {
        monthlyBase = baseVal * 1000;
      } else {
        monthlyBase = baseVal;
      }
      
      months = parseInt(baseMatch[2], 10);
      annualizedBase = monthlyBase * months;
    }
    
    // 2. Try to extract base if it is simple like "G12K" or "15000" or "税前17K"
    if (!monthlyBase) {
      const simpleBaseRegex = /(?:Base:|税前|G|月|月薪)\s*(\d+(?:\.\d+)?)\s*(?:[Kk千万]|(?:000))?/;
      const simpleBaseMatch = clean.match(simpleBaseRegex);
      if (simpleBaseMatch) {
        let baseVal = parseFloat(simpleBaseMatch[1]);
        const isK = simpleBaseMatch[0].includes("k") || simpleBaseMatch[0].includes("K") || simpleBaseMatch[0].includes("千") || baseVal < 100;
        if (isK) {
          monthlyBase = baseVal * 1000;
        } else {
          monthlyBase = baseVal;
        }
        annualizedBase = monthlyBase * 12;
      }
    }

    // 3. Try to extract year-end bonus, e.g. "10w年终", "2-3M", "年终2-3个月"
    const fixedBonusRegex = /(\d+(?:\.\d+)?)\s*(?:[Ww万])\s*(?:年终|奖金)/;
    const fixedBonusMatch = clean.match(fixedBonusRegex);
    if (fixedBonusMatch) {
      annualizedBonus = parseFloat(fixedBonusMatch[1]) * 10000;
    } else {
      const monthsBonusRegex = /(?:年终|奖金|\+)\s*(\d+(?:-\d+)?)\s*(?:个月|[Mm薪])/;
      const monthsBonusMatch = clean.match(monthsBonusRegex);
      if (monthsBonusMatch && monthlyBase) {
        const parts = monthsBonusMatch[1].split("-");
        const bonusMonths = parts.length === 2 ? (parseFloat(parts[0]) + parseFloat(parts[1])) / 2 : parseFloat(parts[0]);
        annualizedBonus = monthlyBase * bonusMonths;
      }
    }
    
    // 4. Try to extract equity/stocks, e.g. "期权50-60w分三年", "3%股份"
    const sharesRegex = /(\d+(?:\.\d+)?)\s*%\s*(?:股份|股权|企业股份)/;
    const sharesMatch = clean.match(sharesRegex);
    if (sharesMatch) {
      equityPercentage = parseFloat(sharesMatch[1]);
      equityType = "shares";
    }
    
    const equityValRegex = /(\d+(?:-\d+)?)\s*(?:[Ww万])\s*(期权|股票|股权|RSU|rsu)/i;
    const equityValMatch = clean.match(equityValRegex);
    if (equityValMatch) {
      const parts = equityValMatch[1].split("-");
      const valTenThousand = parts.length === 2 ? (parseFloat(parts[0]) + parseFloat(parts[1])) / 2 : parseFloat(parts[0]);
      equityTotal = valTenThousand * 10000;
      equityType = equityValMatch[2].toLowerCase().includes("rsu") ? "rsu" : "options";
      
      const vestingRegex = /(?:分|兑现|限)\s*([一二三四五六七八九十\d]+)\s*(?:年)/;
      const vestingMatch = clean.match(vestingRegex);
      if (vestingMatch) {
        const yearMap = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10 };
        const yStr = vestingMatch[1];
        equityVestingYears = parseInt(yStr, 10) || yearMap[yStr] || 3;
      } else {
        equityVestingYears = 3;
      }
      equityAnnualized = Math.round(equityTotal / equityVestingYears);
    }
  }

  // Fallback to annualSalaryRaw
  if (!annualizedBase && annualSalaryRaw) {
    if (annualSalaryRaw < 50000) {
      monthlyBase = annualSalaryRaw;
      months = 12;
      annualizedBase = annualSalaryRaw * 12;
    } else {
      annualizedBase = annualSalaryRaw;
      monthlyBase = Math.round(annualizedBase / 12);
      months = 12;
    }
  }

  const annualizedTotal = (annualizedBase || 0) + (annualizedBonus || 0) + (equityAnnualized || 0);

  return {
    rawText: detailText || "",
    annualizedTotal: annualizedTotal || null,
    base: monthlyBase ? {
      monthly: monthlyBase,
      months: months,
      annualizedBase: annualizedBase || (monthlyBase * months)
    } : null,
    bonus: annualizedBonus ? {
      rawText: fixedBonusMatch ? fixedBonusMatch[0] : "",
      annualizedBonus: annualizedBonus
    } : null,
    equity: (equityTotal || equityPercentage) ? {
      rawText: equityValMatch ? equityValMatch[0] : (sharesMatch ? sharesMatch[0] : ""),
      type: equityType,
      totalValue: equityTotal,
      vestingYears: equityVestingYears,
      annualizedValue: equityAnnualized,
      percentage: equityPercentage
    } : null
  };
}

// Experience Timeline Merger
function cleanCompanyName(name) {
  return (name || "")
    .replace(/\s+\d{5,}$/, "") // remove trailing ids
    .replace(/（[^）]*导数据[^）]*）/, "")
    .replace(/(?:有限公司|股份公司|合伙企业|责任公司|上海分公司|北京分公司)$/, "")
    .trim();
}

function mergeExperiences(experiences) {
  if (!Array.isArray(experiences) || experiences.length === 0) return [];
  
  // Sort from latest to oldest (by period or parsed dates)
  // Period format typically "YYYY.MM - YYYY.MM" or similar
  const sorted = [...experiences].sort((a, b) => {
    const aStart = (a.period || "").split("-")[0].trim();
    const bStart = (b.period || "").split("-")[0].trim();
    return bStart.localeCompare(aStart);
  });

  const merged = [];
  for (const exp of sorted) {
    const cleanCompany = cleanCompanyName(exp.company);
    if (!cleanCompany) continue;

    // Look for matching company in merged
    const dup = merged.find(m => {
      const mc = cleanCompanyName(m.company);
      // Check 80%+ similarity or inclusion
      return mc.includes(cleanCompany) || cleanCompany.includes(mc);
    });

    if (dup) {
      // Merge description if different
      if (exp.description && !dup.description.includes(exp.description.slice(0, 50))) {
        dup.description = `${dup.description}\n\n[来自另一个版本]\n${exp.description}`;
      }
      // Merge periods (use the union of periods or keep the latest)
      if (exp.period && !dup.period.includes(exp.period)) {
        dup.period = `${dup.period} / ${exp.period}`;
      }
    } else {
      merged.push({
        id: exp.id,
        company: exp.company,
        title: exp.title,
        period: exp.period,
        description: exp.description
      });
    }
  }

  return merged;
}

// Notes Structurer and Tag Extractor
const CATEGORY_MAP = {
  "Interview Evaluation": "面试评价",
  "顾问面试评价": "面试评价",
  "Quick Note": "日常备注",
  "备注": "日常备注",
  "1U14mtA4-O8cPw1EfV": "日常备注",
  "联系人备注": "日常备注",
  "Candidate Call": "沟通记录",
  "候选人电话": "沟通记录",
  "Telephone Appointment": "沟通记录",
  "电话预约": "沟通记录",
  "System Notification": "系统记录",
  "系统记录": "系统记录",
  "Imported Note": "系统记录",
  "导入备注": "系统记录",
  "友人介绍": "其他备注",
  "n74937093490099580": "其他备注"
};

const SEEKING_STATUS_KEYWORDS = {
  active: ["看新机会", "看机会", "跳槽", "求职", "考虑机会", "考虑新职位", "在找工作"],
  passive: ["不看机会", "已入职", "近期不看", "满意现状", "稳定", "不考虑看机会"]
};

const EXTRACTION_TAGS = [
  { tag: "考虑赴日", keywords: ["考虑去日本", "赴日", "日本工作", "考虑赴日"] },
  { tag: "求职保密", keywords: ["保密", "求职保密", "不要发简历", "其他顾问请勿联系", "希望不传"] },
  { tag: "日语流利", keywords: ["日语口语", "日语流利", "日语商务", "日语日常"] },
  { tag: "情绪抗压偏低", keywords: ["抑郁", "情绪", "抗压力低", "胡思乱想"] },
  { tag: "已入职", keywords: ["已入职", "上岗"] }
];

function parseDate(s) {
  if (!s) return null;
  const clean = String(s).trim().replace(" ", "T");
  const time = Date.parse(clean);
  if (Number.isFinite(time)) return new Date(time);
  return null;
}

function structureNotes(notesList, originalNotesStrings, record) {
  const structuredTimeline = [];
  const extractedTags = new Set();
  let seekingStatus = "unknown";

  // 1. Process notes timeline (from deep candidate record notes)
  if (Array.isArray(notesList)) {
    for (const n of notesList) {
      if (!isObject(n)) continue;
      const result = n.result || {};
      const noteItems = result.note || [];
      if (!Array.isArray(noteItems)) continue;

      for (const item of noteItems) {
        if (!isObject(item)) continue;

        const dateAdded = item.dateAdded || "";
        const rawCategory = item.category || item.__name__ || "Other";
        const category = CATEGORY_MAP[rawCategory] || "其他备注";

        // format all_content for full original text
        const parts = [];
        if (Array.isArray(item.all_content)) {
          for (const part of item.all_content) {
            if (isObject(part)) {
              const lbl = part.label || "";
              const val = part.value || "";
              if (lbl && val) parts.push(`${lbl}: ${val}`);
              else if (val) parts.push(val);
              else if (lbl) parts.push(lbl);
            }
          }
        }
        const formattedContent = parts.join(" | ") || item.content || "";
        
        structuredTimeline.push({
          id: item.id,
          dateAdded,
          category,
          rawCategory,
          content: formattedContent,
        });

        // Search for keywords in content
        const lowerContent = formattedContent.toLowerCase();
        for (const kw of SEEKING_STATUS_KEYWORDS.active) {
          if (lowerContent.includes(kw)) seekingStatus = "active";
        }
        for (const kw of SEEKING_STATUS_KEYWORDS.passive) {
          if (lowerContent.includes(kw)) seekingStatus = "passive";
        }

        for (const rule of EXTRACTION_TAGS) {
          if (rule.keywords.some(kw => lowerContent.includes(kw))) {
            extractedTags.add(rule.tag);
          }
        }
      }
    }
  }

  // Fallback to originalNotesStrings (from persol-report-data notes) if deep notes are missing
  if (structuredTimeline.length === 0 && Array.isArray(originalNotesStrings)) {
    originalNotesStrings.forEach((content, index) => {
      const lowerContent = content.toLowerCase();
      structuredTimeline.push({
        id: `fallback-${index}`,
        dateAdded: record.lastContactDate || record.lastUpdateDate || "",
        category: "普通备注",
        rawCategory: "Notes",
        content: content,
      });

      for (const kw of SEEKING_STATUS_KEYWORDS.active) {
        if (lowerContent.includes(kw)) seekingStatus = "active";
      }
      for (const kw of SEEKING_STATUS_KEYWORDS.passive) {
        if (lowerContent.includes(kw)) seekingStatus = "passive";
      }

      for (const rule of EXTRACTION_TAGS) {
        if (rule.keywords.some(kw => lowerContent.includes(kw))) {
          extractedTags.add(rule.tag);
        }
      }
    });
  }

  // Sort timeline descending by dateAdded
  structuredTimeline.sort((a, b) => b.dateAdded.localeCompare(a.dateAdded));

  // Determine latest interaction date from notes
  const latestNoteDate = structuredTimeline[0]?.dateAdded || record.lastContactDate || record.lastUpdateDate || "";

  return {
    timeline: structuredTimeline,
    seekingStatus,
    extractedTags: [...extractedTags],
    logUpdateDate: latestNoteDate
  };
}

function isObject(val) {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

// ─── Main Execution ─────────────────────────────────────────────────────────

async function main() {
  console.log("Loading indices...");
  const reportData = JSON.parse(readFileSync(reportPath, "utf8"));
  const indexData = JSON.parse(readFileSync(indexPath, "utf8"));

  const records = reportData.records;
  const profiles = indexData.profiles;

  const profilesById = new Map(profiles.map(p => [p.id, p]));

  // 1. Filter candidates who have notes
  const candidatesWithNotes = records.filter(r => r.notes && r.notes.length > 0);
  console.log(`Total candidates: ${records.length}, with notes: ${candidatesWithNotes.length}`);

  // 2. Score candidates by information abundance
  // Score = noteCount*3 + expCount*2 + projCount*2 + eduCount*1
  candidatesWithNotes.forEach(r => {
    const prof = profilesById.get(r.id) || {};
    const noteCount = r.notes.length;
    const expCount = r.experienceCount || (prof.experiences ? prof.experiences.length : 0);
    const projCount = r.projectCount || (prof.projects ? prof.projects.length : 0);
    const eduCount = r.educationCount || (prof.educations ? prof.educations.length : 0);
    
    r._govScore = (noteCount * 3) + (expCount * 2) + (projCount * 2) + (eduCount * 1);
  });

  // Sort by score descending
  candidatesWithNotes.sort((a, b) => b._govScore - a._govScore);

  // Take the top 5000
  const top5000 = candidatesWithNotes.slice(0, 5000);
  const top5000Ids = new Set(top5000.map(r => r.id));
  console.log(`Selected top 5000 candidates with notes. Min score: ${top5000[top5000.length - 1]?._govScore}`);

  // Load raw deep candidate records to get full notes structured objects
  let rawDeepData = {};
  if (existsSync("/tmp/top10_raw_deep.json")) {
    rawDeepData = JSON.parse(readFileSync("/tmp/top10_raw_deep.json", "utf8"));
    rawDeepData = Object.fromEntries(Object.entries(rawDeepData).map(([k, v]) => [parseInt(k), v]));
  }

  // Since we need notes structure for all 5000 candidates, let's load from candidate_deep.jsonl if needed,
  // but wait: can we read candidate_deep.jsonl dynamically?
  // Let's read candidate_deep.jsonl in a single pass to fetch notes for the 5000 selected IDs!
  // This is extremely fast (takes about 15-20s for 2.4GB) and ensures we get the real structured notes!
  console.log("Reading candidate_deep.jsonl to extract full notes/attachments...");
  const deepNotesById = new Map();
  const deepFilesById = new Map();

  const deepPath = join(appRoot, "..", "persol-export-20260523-hr-admin-full", "candidate_deep.jsonl");
  const rl = createInterface({
    input: createReadStream(deepPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let processedLines = 0;
  for await (const line of rl) {
    processedLines++;
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const rec = JSON.parse(trimmed);
      if (top5000Ids.has(rec.id)) {
        deepNotesById.set(rec.id, rec.notes || []);
        deepFilesById.set(rec.id, rec.files || []);
      }
    } catch {}
  }
  console.log(`Processed ${processedLines} lines of deep jsonl.`);

  // 3. Process the records
  let governedCount = 0;

  for (const record of records) {
    const isGoverned = top5000Ids.has(record.id);
    const prof = profilesById.get(record.id);

    if (isGoverned) {
      governedCount++;

      // A. Salary Governance
      const govSalary = parseCompensationDetail(record.compensationDetail, record.annualSalaryRaw || record.annualSalary);
      record.governedSalary = govSalary;

      // B. Notes Governance
      const deepNotes = deepNotesById.get(record.id) || [];
      const govNotes = structureNotes(deepNotes, record.notes, record);
      record.governedNotes = govNotes;
      record.logUpdateDate = govNotes.logUpdateDate || record.lastContactDate || record.lastUpdateDate || "";

      // C. Experiences Governance
      if (prof) {
        const govExps = mergeExperiences(prof.experiences);
        prof.governedExperiences = govExps;
      }
    } else {
      // Preserve default values for non-governed candidates
      record.governedSalary = null;
      record.governedNotes = null;
      record.logUpdateDate = record.lastContactDate || record.lastUpdateDate || "";
      if (prof) {
        prof.governedExperiences = null;
      }
    }

    // Clean score helper
    delete record._govScore;
  }

  // 4. Save files back
  console.log("Saving report data...");
  writeFileSync(reportPath, JSON.stringify(reportData, null, 2));

  console.log("Saving profile index data...");
  writeFileSync(indexPath, JSON.stringify(indexData, null, 2));

  console.log(`Governance script complete. Governed ${governedCount} candidates!`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
