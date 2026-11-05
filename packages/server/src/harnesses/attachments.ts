import type { ImageContent, TextContent } from "@earendil-works/pi-ai";
import type { EntryRecord } from "@earendil-works/pi-durable";
import sharp from "sharp";

export const attachmentLimit = 2 * 1024 * 1024;
export const textLimit = 128 * 1024;
export type AttachmentInput = { name: string; mimeType: string; data: string };
export type AttachmentInfo = {
  name: string;
  mimeType: string;
  size: number;
  block: number;
  prefix?: number;
  thumbnail?: string;
  original?: string;
};
export class AttachmentError extends Error {
  readonly statusCode = 400;
}
export type AttachedInput = { text: string; attachments: AttachmentInfo[] };
const images = new Set(["image/png", "image/jpeg", "image/webp"]);
export async function prepareAttachments(
  content: string,
  files: AttachmentInput[],
  imageSupported: boolean,
) {
  if (!content.trim() && !files.length)
    throw new AttachmentError("Write a message or attach a file.");
  if (files.length > 4) throw new AttachmentError("Attach up to four files.");
  const blocks: (TextContent | ImageContent)[] = [
    { type: "text", text: content },
  ];
  const info: AttachmentInfo[] = [];
  let total = 0;
  for (const file of files) {
    if (
      !file.name.trim() ||
      file.name.length > 200 ||
      /[\\/]/.test(file.name) ||
      Array.from(file.name).some((character) => character.charCodeAt(0) < 32)
    )
      throw new AttachmentError(
        "Use a filename without paths or control characters.",
      );
    const bytes = Buffer.from(file.data, "base64");
    if (!bytes.length || bytes.toString("base64") !== file.data)
      throw new AttachmentError("Invalid attachment encoding.");
    total += bytes.length;
    if (total > attachmentLimit)
      throw new AttachmentError("Attachments must total 2 MB or less.");
    if (images.has(file.mimeType)) {
      if (!imageSupported)
        throw new AttachmentError("Choose a model that supports images.");
      let data: Buffer;
      try {
        const input = sharp(bytes, {
          limitInputPixels: 16_000_000,
          animated: false,
        });
        const metadata = await input.metadata();
        const expected =
          file.mimeType === "image/jpeg" ? "jpeg" : file.mimeType.slice(6);
        if (metadata.format !== expected || (metadata.pages ?? 1) > 1)
          throw new Error();
        data = await input.rotate().webp({ quality: 90 }).toBuffer();
      } catch {
        throw new AttachmentError(
          "Use a valid static PNG, JPEG or WebP image under 16 megapixels.",
        );
      }
      if (data.length > attachmentLimit)
        throw new AttachmentError("Image is too large after processing.");
      const thumbnail = await sharp(data)
        .resize(96, 96, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 40 })
        .toBuffer();
      blocks.push({
        type: "text",
        text: `Attached image: ${JSON.stringify(file.name)}`,
      });
      info.push({
        name: file.name,
        mimeType: file.mimeType,
        size: bytes.length,
        original: file.data,
        block: blocks.length,
        ...(thumbnail.length <= 4096
          ? { thumbnail: thumbnail.toString("base64") }
          : {}),
      });
      blocks.push({
        type: "image",
        mimeType: "image/webp",
        data: data.toString("base64"),
      });
    } else {
      if (file.mimeType !== "text/plain" || bytes.length > textLimit)
        throw new AttachmentError("Use UTF-8 text/code files up to 128 KB.");
      let text: string;
      try {
        text = new TextDecoder("utf-8", {
          fatal: true,
          ignoreBOM: true,
        }).decode(bytes);
      } catch {
        throw new AttachmentError("This file is not valid UTF-8 text.");
      }
      if (
        Array.from(text).some(
          (character) =>
            character.charCodeAt(0) < 32 &&
            ![9, 10, 13].includes(character.charCodeAt(0)),
        )
      )
        throw new AttachmentError("Binary files are not supported.");
      const prefix = `Attached file: ${JSON.stringify(file.name)}\n\n`;
      info.push({
        name: file.name,
        mimeType: "text/plain",
        size: bytes.length,
        block: blocks.length,
        prefix: prefix.length,
      });
      blocks.push({ type: "text", text: prefix + text });
    }
  }
  return { blocks, info };
}
export function attachedInput(entry: EntryRecord): AttachedInput | undefined {
  if (entry.kind !== "console.input") return;
  return entry.data as AttachedInput;
}
export function readAttachment(entry: EntryRecord, index: number) {
  const info = attachedInput(entry)?.attachments[index];
  const message = entry.model?.[0];
  if (!info || message?.role !== "user" || !Array.isArray(message.content))
    return;
  const block = message.content[info.block];
  if (!block) return;
  const data =
    block.type === "image"
      ? (info.original ?? block.data)
      : Buffer.from(block.text.slice(info.prefix ?? 0)).toString("base64");
  return { name: info.name, mimeType: info.mimeType, data };
}
