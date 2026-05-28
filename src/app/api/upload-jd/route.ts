import { NextRequest } from "next/server";

import { extractTextFromJDFile } from "@/lib/document-extract";
import { verifyAuth } from "@/lib/session-auth";

export const runtime = "nodejs";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB, 跟 README 一致
const ALLOWED_EXTENSIONS = new Set([".txt", ".md", ".docx"]);

export async function POST(request: NextRequest) {
  if (!(await verifyAuth())) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "请上传 JD 文件" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return Response.json(
      { error: `文件超过 5MB 上限（当前 ${Math.round(file.size / 1024)}KB）` },
      { status: 413 },
    );
  }

  const lowerName = file.name.toLowerCase();
  const hasAllowedExt = [...ALLOWED_EXTENSIONS].some((ext) => lowerName.endsWith(ext));
  if (!hasAllowedExt) {
    return Response.json(
      { error: "暂时只支持 .txt / .md / .docx 文件" },
      { status: 415 },
    );
  }

  try {
    const text = await extractTextFromJDFile(file);

    if (text.length < 20) {
      return Response.json({ error: "文件内容过短，未能提取有效 JD 文本" }, { status: 400 });
    }

    return Response.json({
      fileName: file.name,
      size: file.size,
      text,
      charCount: text.length,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "JD 文件解析失败" },
      { status: 400 },
    );
  }
}
