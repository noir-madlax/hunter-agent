#!/usr/bin/env node
/**
 * One-shot A/B comparison: baseline prompt (pre-pipeline merge) vs current prompt (post-merge).
 *
 * Usage:
 *   node scripts/compare-pipeline-runs.mjs <jd-file>
 *
 * Output:
 *   tests/runs/<slug>-baseline.md
 *   tests/runs/<slug>-merged.md
 *   tests/runs/<slug>-meta.json (token usage, timings)
 */

import OpenAI from "openai";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";

// ---------------------------------------------------------------------------
// Load the live runtime prompt and split out the 8 pipeline rules to construct
// a "baseline" variant.
// ---------------------------------------------------------------------------

function loadRuntimePromptRules() {
  const src = readFileSync(resolve("src/lib/headhunter-skills.ts"), "utf8");
  const m = src.match(/=\s*\[([\s\S]+?)\]\.join/);
  if (!m) throw new Error("could not locate prompt array in headhunter-skills.ts");
  // Each rule is wrapped in double quotes followed by a comma.
  const lines = m[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith('"') && l.endsWith(","));
  // Strip the leading " and trailing ",
  return lines.map((l) => l.slice(1, -2));
}

// Keywords that identify the 8 Module-99 pipeline rules we injected.
// (Anchored on substrings that ONLY appear in the new rules.)
const PIPELINE_RULE_MARKERS = [
  "Full Role Intake Pipeline",
  "Stage 1 JD 信号反演",
  "Stage 2 失败模式预演三层",
  "Stage 3 人才库体检",
  "Stage 5 评分自动选 Rubric",
  "Stage 6 Next-step 分叉",
  "Pipeline 自检 7 条",
  "Pipeline 不是一次性的",
];

const rules = loadRuntimePromptRules();
const mergedPrompt = rules.join("\n");
const baselineRules = rules.filter((r) => !PIPELINE_RULE_MARKERS.some((k) => r.includes(k)));
const baselinePrompt = baselineRules.join("\n");

const removed = rules.length - baselineRules.length;
if (removed !== PIPELINE_RULE_MARKERS.length) {
  console.error(
    `WARN expected to remove ${PIPELINE_RULE_MARKERS.length} rules, removed ${removed}.`,
  );
}

// ---------------------------------------------------------------------------
// Read JD
// ---------------------------------------------------------------------------

const jdPath = process.argv[2];
if (!jdPath) {
  console.error("usage: node scripts/compare-pipeline-runs.mjs <jd-file>");
  process.exit(2);
}
const jd = readFileSync(resolve(jdPath), "utf8");
const slug = basename(jdPath).replace(/\.[^.]+$/, "");

// ---------------------------------------------------------------------------
// Common user instruction (asks for a full analysis, not just JSON parse)
// ---------------------------------------------------------------------------

const userInstruction = `下面是一份客户岗位 brief（JD + 公司背景）。请以资深猎头顾问身份完整分析。

要求：
- 用中文 Markdown 输出
- 给出完整诊断、画像、寻访策略
- 不要只输出 JSON

JD/Brief：
${jd}`;

// ---------------------------------------------------------------------------
// Call DeepSeek twice
// ---------------------------------------------------------------------------

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) throw new Error("DEEPSEEK_API_KEY missing");
const model = process.env.DEEPSEEK_ANALYSIS_MODEL || process.env.DEEPSEEK_MODEL || "deepseek-v4-pro";

const client = new OpenAI({
  apiKey,
  baseURL: "https://api.deepseek.com",
  timeout: 180_000,
});

async function callOnce(systemPrompt, label) {
  const t0 = Date.now();
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userInstruction },
    ],
    max_tokens: 8000,
    temperature: 0.3,
  });
  const elapsed = Date.now() - t0;
  const content = completion.choices[0]?.message?.content ?? "";
  const usage = completion.usage ?? null;
  console.log(
    `[${label}] elapsed=${elapsed}ms prompt_tok=${usage?.prompt_tokens ?? "?"} completion_tok=${usage?.completion_tokens ?? "?"}`,
  );
  return { content, elapsed, usage };
}

async function main() {
  const outDir = resolve("tests/runs");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  console.log(`Model: ${model}`);
  console.log(`Baseline prompt: ${baselineRules.length} rules (removed ${removed})`);
  console.log(`Merged   prompt: ${rules.length} rules`);
  console.log(`JD:      ${jdPath} (${jd.length} chars)`);
  console.log("");

  console.log("--- running BASELINE ---");
  const baseline = await callOnce(baselinePrompt, "baseline");
  console.log("--- running MERGED   ---");
  const merged = await callOnce(mergedPrompt, "merged");

  const baselineFile = resolve(outDir, `${slug}-baseline.md`);
  const mergedFile = resolve(outDir, `${slug}-merged.md`);
  const metaFile = resolve(outDir, `${slug}-meta.json`);

  writeFileSync(baselineFile, baseline.content);
  writeFileSync(mergedFile, merged.content);
  writeFileSync(
    metaFile,
    JSON.stringify(
      {
        model,
        jdPath,
        baselineRules: baselineRules.length,
        mergedRules: rules.length,
        rulesRemoved: removed,
        baseline: { usage: baseline.usage, elapsedMs: baseline.elapsed },
        merged: { usage: merged.usage, elapsedMs: merged.elapsed },
      },
      null,
      2,
    ),
  );

  console.log("");
  console.log(`wrote ${baselineFile}`);
  console.log(`wrote ${mergedFile}`);
  console.log(`wrote ${metaFile}`);
}

main().catch((err) => {
  console.error("compare-pipeline-runs failed:", err);
  process.exitCode = 1;
});
