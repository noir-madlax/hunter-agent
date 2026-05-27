# Boss Agent Recruiting MVP

本地 MVP，用于把客户岗位需求/JD/电话纪要解析成猎头交付策略。

## Current Scope

- 岗位解析
- 人才画像
- 搜寻地图
- JD 文件上传：支持 `.txt`、`.md`、`.docx`，单文件 5MB 以内
- 项目数据写入 SQLite
- DeepSeek/OpenAI API 可选；未配置 API key 时使用本地 fallback 规则
- 猎头技能包：`skills/headhunter/SKILL.md` 作为入口，详细模块在 `skills/headhunter/modules/`

## Setup

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run db:init
npm run dev
```

打开 `http://localhost:3000`。

## Environment

```bash
DATABASE_URL="file:./dev.db"
DEEPSEEK_API_KEY=""
DEEPSEEK_MODEL="deepseek-v4-pro"
DEEPSEEK_FAST_MODEL="deepseek-v4-pro"
DEEPSEEK_ANALYSIS_MODEL="deepseek-v4-pro"
DEEPSEEK_SCREENING_MODEL="deepseek-v4-pro"
OPENAI_API_KEY=""
OPENAI_MODEL="gpt-5.2"
```

## Notes

当前环境中 Prisma schema engine 无法稳定执行 `migrate dev`，所以第一版使用手写 SQL 初始化 SQLite，同时保留 Prisma Client 作为应用访问层。
