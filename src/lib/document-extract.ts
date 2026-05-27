import { inflateRawSync } from "node:zlib";

type ZipEntry = {
  compression: number;
  compressedSize: number;
  fileName: string;
  localHeaderOffset: number;
};

const maxUploadBytes = 5 * 1024 * 1024;

function readUInt16(buffer: Buffer, offset: number) {
  return buffer.readUInt16LE(offset);
}

function readUInt32(buffer: Buffer, offset: number) {
  return buffer.readUInt32LE(offset);
}

function decodeXmlEntities(input: string) {
  return input.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (_, entity: string) => {
    if (entity === "amp") return "&";
    if (entity === "lt") return "<";
    if (entity === "gt") return ">";
    if (entity === "quot") return "\"";
    if (entity === "apos") return "'";

    const radix = entity.startsWith("#x") ? 16 : 10;
    const code = Number.parseInt(entity.replace(/^#x?/i, ""), radix);
    return Number.isFinite(code) ? String.fromCodePoint(code) : "";
  });
}

function normalizeText(input: string) {
  return input
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function findEndOfCentralDirectory(buffer: Buffer) {
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65558); i -= 1) {
    if (readUInt32(buffer, i) === 0x06054b50) {
      return i;
    }
  }

  throw new Error("无法识别 docx 文件结构");
}

function listZipEntries(buffer: Buffer): ZipEntry[] {
  const eocd = findEndOfCentralDirectory(buffer);
  const entryCount = readUInt16(buffer, eocd + 10);
  const centralDirectoryOffset = readUInt32(buffer, eocd + 16);
  const entries: ZipEntry[] = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (readUInt32(buffer, offset) !== 0x02014b50) {
      throw new Error("docx central directory 损坏");
    }

    const compression = readUInt16(buffer, offset + 10);
    const compressedSize = readUInt32(buffer, offset + 20);
    const fileNameLength = readUInt16(buffer, offset + 28);
    const extraLength = readUInt16(buffer, offset + 30);
    const commentLength = readUInt16(buffer, offset + 32);
    const localHeaderOffset = readUInt32(buffer, offset + 42);
    const fileName = buffer
      .subarray(offset + 46, offset + 46 + fileNameLength)
      .toString("utf8");

    entries.push({
      compression,
      compressedSize,
      fileName,
      localHeaderOffset,
    });

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function readZipEntry(buffer: Buffer, entry: ZipEntry) {
  const offset = entry.localHeaderOffset;

  if (readUInt32(buffer, offset) !== 0x04034b50) {
    throw new Error(`docx local header 损坏：${entry.fileName}`);
  }

  const fileNameLength = readUInt16(buffer, offset + 26);
  const extraLength = readUInt16(buffer, offset + 28);
  const dataStart = offset + 30 + fileNameLength + extraLength;
  const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.compression === 0) return compressed;
  if (entry.compression === 8) return inflateRawSync(compressed);

  throw new Error(`不支持的 docx 压缩格式：${entry.compression}`);
}

function wordXmlToText(xml: string) {
  const tokens =
    /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:delText\b[^>]*>([\s\S]*?)<\/w:delText>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>|<\/w:tc>|<\/w:tr>|<\/w:p>/g;
  let output = "";

  for (const match of xml.matchAll(tokens)) {
    const token = match[0];
    if (match[1] || match[2]) {
      output += decodeXmlEntities(match[1] || match[2] || "");
    } else if (token.startsWith("<w:tab") || token === "</w:tc>") {
      output += "\t";
    } else {
      output += "\n";
    }
  }

  return normalizeText(output);
}

function extractDocxText(buffer: Buffer) {
  const entries = listZipEntries(buffer);
  const textParts = ["word/document.xml", "word/header1.xml", "word/footer1.xml"]
    .map((fileName) => entries.find((entry) => entry.fileName === fileName))
    .filter(Boolean)
    .map((entry) => wordXmlToText(readZipEntry(buffer, entry as ZipEntry).toString("utf8")))
    .filter(Boolean);

  if (!textParts.length) {
    throw new Error("未能从 docx 中提取正文");
  }

  return normalizeText(textParts.join("\n\n"));
}

function getExtension(fileName: string) {
  return fileName.toLowerCase().split(".").pop() || "";
}

export async function extractTextFromJDFile(file: File) {
  if (file.size > maxUploadBytes) {
    throw new Error("文件过大，请上传 5MB 以内的 JD 文件");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const extension = getExtension(file.name);

  if (extension === "txt" || extension === "md") {
    return normalizeText(buffer.toString("utf8"));
  }

  if (extension === "docx") {
    return extractDocxText(buffer);
  }

  throw new Error("当前支持 .txt、.md、.docx 格式。PDF 支持会在下一版加入。");
}
