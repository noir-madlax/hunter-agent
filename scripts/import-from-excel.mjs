import { createReadStream, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = dirname(scriptDir);

const reportPath = join(appRoot, "data", "persol-report-data.json");

// ─── Command line args ──────────────────────────────────────────────────────

const csvPath = process.argv[2];
if (!csvPath || !existsSync(csvPath)) {
  console.error("Usage: node scripts/import-from-excel.mjs <standard_csv_file_path>");
  process.exit(1);
}

// Simple robust CSV parser handling quotes
function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result.map(val => val.replace(/^"|"$/g, '').replace(/""/g, '"'));
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

function parseDate(s) {
  if (!s) return null;
  const clean = String(s).trim().replace(" ", "T");
  const time = Date.parse(clean);
  if (Number.isFinite(time)) return new Date(time);
  return null;
}

async function main() {
  let existingReport = { metadata: { total: 0 }, records: [] };
  if (existsSync(reportPath)) {
    try {
      existingReport = JSON.parse(readFileSync(reportPath, "utf8"));
    } catch (e) {
      console.warn("Could not parse existing report data, starting fresh.", e);
    }
  }
  
  // Create a map of existing records by mobile / email / name+company for deduplication
  const reportByMobile = new Map();
  const reportByEmail = new Map();
  const reportBySignature = new Map();

  for (const r of existingReport.records) {
    if (r.mobile) reportByMobile.set(r.mobile, r);
    if (r.email) reportByEmail.set(r.email, r);
    const signature = `${r.chineseName || r.name}|${r.companyName}`.toLowerCase();
    reportBySignature.set(signature, r);
  }

  const rl = createInterface({
    input: createReadStream(csvPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let header = null;
  let rowCount = 0;
  let importedCount = 0;
  let duplicateCount = 0;

  // Let's generate sequential IDs starting from a large number to prevent collisions
  let nextId = 900000000 + Math.floor(Math.random() * 50000000);

  const newRecords = [];

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    if (!header) {
      header = parseCsvLine(trimmed);
      continue;
    }

    rowCount++;
    const row = parseCsvLine(trimmed);
    
    // Map columns to standard fields
    // Columns (suggested): 姓名, 当前公司, 当前职位, 手机, 邮箱, 年龄, 城市, 当前年薪（万元）, 期望薪资, 职能路径, 备注
    const recordMap = {};
    header.forEach((col, idx) => {
      recordMap[col] = row[idx] ?? "";
    });

    const name = recordMap["姓名"] || recordMap["name"] || "";
    const company = recordMap["当前公司"] || recordMap["companyName"] || "";
    const title = recordMap["当前职位"] || recordMap["title"] || "";
    const mobile = recordMap["手机"] || recordMap["mobile"] || "";
    const email = recordMap["邮箱"] || recordMap["email"] || "";
    const ageVal = recordMap["年龄"] || recordMap["age"] || "";
    const city = recordMap["城市"] || recordMap["city"] || "";
    const salaryVal = recordMap["当前年薪（万元）"] || recordMap["annualSalary"] || "";
    const expectedSalary = recordMap["期望薪资"] || recordMap["expectedSalary"] || "";
    const functionPath = recordMap["职能路径"] || recordMap["functionPath"] || "";
    const noteContent = recordMap["备注"] || recordMap["note"] || "";

    if (!name && !mobile) {
      console.warn(`Row ${rowCount}: Missing both name and mobile, skipping.`);
      continue;
    }

    // Deduplication check
    let duplicateOf = null;
    if (mobile && reportByMobile.has(mobile)) duplicateOf = reportByMobile.get(mobile);
    else if (email && reportByEmail.has(email)) duplicateOf = reportByEmail.get(email);
    else {
      const signature = `${name}|${company}`.toLowerCase();
      if (reportBySignature.has(signature)) duplicateOf = reportBySignature.get(signature);
    }

    if (duplicateOf) {
      duplicateCount++;
      // We could update or just skip. Let's merge note if new note is different.
      if (noteContent && !duplicateOf.notes.includes(noteContent)) {
        duplicateOf.notes.push(noteContent);
        duplicateOf.hasNotes = true;
      }
      continue;
    }

    // Parse values
    const age = ageVal ? parseInt(ageVal, 10) || null : null;
    const salaryTenThousand = salaryVal ? parseFloat(salaryVal) || null : null;
    const annualSalary = salaryTenThousand ? salaryTenThousand * 10000 : null;

    const notes = noteContent ? [noteContent] : [];

    const merged = {
      id: nextId++,
      name,
      chineseName: name,
      englishName: "",
      companyName: company,
      title,
      firstExperienceTitle: "",
      functionPath,
      functionTags: functionPath ? functionPath.split("$").filter(Boolean) : [],
      mobile,
      email,
      age,
      gender: "未知",
      annualSalary,
      expectedSalary,
      compensationDetail: "",
      lastContactDate: new Date().toISOString().slice(0, 19).replace("T", " "),
      lastUpdateDate: new Date().toISOString().slice(0, 19).replace("T", " "),
      lastStatusDate: "",
      dateAdded: new Date().toISOString().slice(0, 19).replace("T", " "),
      source: "excel",
      status: "新导入",
      consultantRank: "",
      owner: null,
      addedBy: null,
      companyId: null,
      functionCodes: [],
      cityCodes: city ? [city] : [],
      locationCodes: [],
      industryCodes: [],
      educationCount: 0,
      experienceCount: 0,
      projectCount: 0,
      languageCount: 0,
      skillCount: 0,
      notes,
      hasNotes: notes.length > 0,
    };

    // Governance computations
    const issues = [];
    if (isJunkCompany(merged.companyName)) {
      issues.push(`垃圾公司名: ${JSON.stringify(merged.companyName)}`);
    }
    if (!merged.title || ["未知", "unknown", "-", "NULL", "null"].includes(merged.title)) {
      issues.push(`无效或缺失职位: ${JSON.stringify(merged.title)}`);
    }
    if (!merged.email && !merged.mobile) {
      issues.push("没有任何联系方式");
    } else if (!merged.email) {
      issues.push("缺少邮箱");
    } else if (!merged.mobile) {
      issues.push("缺少电话");
    }
    if (!merged.title && !merged.functionPath) {
      issues.push("完全缺失职能信息 (no title & no functionPath)");
    }

    merged.annualSalaryRaw = annualSalary;
    merged.dataQuality = {
      issues,
      issueCount: issues.length,
      hasJunkCompany: isJunkCompany(merged.companyName),
      hasInvalidTitle: !merged.title || ["未知", "unknown", "-", "NULL", "null"].includes(merged.title),
      hasSuspiciousSalary: false,
      isStale: false,
      noIdentity: !merged.title && !merged.functionPath,
    };

    newRecords.push(merged);
    importedCount++;
  }

  if (newRecords.length > 0) {
    existingReport.records.push(...newRecords);
    
    // Save report data and update metadata
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

    existingReport.metadata.total = existingReport.records.length;
    existingReport.metadata.withNotes = existingReport.records.filter((r) => r.hasNotes).length;
    existingReport.metadata.withEmail = existingReport.records.filter((r) => r.email).length;
    existingReport.metadata.withMobile = existingReport.records.filter((r) => r.mobile).length;
    existingReport.metadata.topCompanies = topCounts(existingReport.records.map((r) => r.companyName));
    existingReport.metadata.topTitles = topCounts(existingReport.records.map((r) => r.title));
    existingReport.metadata.sources = topCounts(existingReport.records.map((r) => r.source), 30);
    existingReport.metadata.statuses = topCounts(existingReport.records.map((r) => r.status), 30);
    existingReport.metadata.functionPaths = topCounts(existingReport.records.map((r) => r.functionPath), 30);
    existingReport.metadata.generatedAt = new Date().toISOString();

    writeFileSync(
      reportPath,
      JSON.stringify(existingReport, null, 2)
    );
  }

  console.log(`=== CSV IMPORT SUMMARY ===`);
  console.log(`Processed rows: ${rowCount}`);
  console.log(`Successfully imported: ${importedCount}`);
  console.log(`Duplicates skipped/merged: ${duplicateCount}`);
  console.log(`Total records in candidate pool now: ${existingReport.records.length}`);
  console.log(`Saved report data to: ${reportPath}`);
}

main().catch((err) => {
  console.error("CSV import failed:", err);
  process.exit(1);
});
