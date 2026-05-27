import { NextRequest } from "next/server";

import { extractTextFromJDFile } from "@/lib/document-extract";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "请上传 JD 文件" }, { status: 400 });
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
