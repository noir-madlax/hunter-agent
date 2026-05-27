import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const maxBytes = Number(process.env.AGENT_RUN_OUTPUT_MAX_BYTES || 1_000_000);
const dbUrl = process.env.DATABASE_URL || "file:./prisma/dev.db";
const dbPath = dbUrl.startsWith("file:") ? dbUrl.slice("file:".length) : dbUrl;
const absoluteDbPath = resolve(process.cwd(), dbPath);

if (!existsSync(absoluteDbPath)) {
  throw new Error(`SQLite database not found: ${absoluteDbPath}`);
}

const countSql = `select count(*) from AgentRun where length(outputJson) > ${maxBytes};`;
const before = execFileSync("sqlite3", [absoluteDbPath, countSql], { encoding: "utf8" }).trim();
const updateSql = `
update AgentRun
set outputJson = '{"pruned":true,"reason":"AgentRun output exceeded storage limit and was compacted."}'
where length(outputJson) > ${maxBytes};
`;

execFileSync("sqlite3", [absoluteDbPath, updateSql], { stdio: "inherit" });
console.log(`Pruned ${before || 0} AgentRun output payload(s) over ${maxBytes} bytes.`);
