export type ChatAttachment = {
  id: string;
  name: string;
  mimeType: string;
  data: string;
};
export const attachmentLimit = 2 * 1024 * 1024;
export const fileAccept =
  "image/png,image/jpeg,image/webp,text/*,.md,.txt,.csv,.json,.jsonl,.yaml,.yml,.toml,.xml,.html,.css,.js,.jsx,.ts,.tsx,.py,.rs,.go,.sh,.sql,.log";
export function attachmentBytes(file: Pick<ChatAttachment, "data">) {
  return (
    Math.floor((file.data.length * 3) / 4) -
    (file.data.endsWith("==") ? 2 : file.data.endsWith("=") ? 1 : 0)
  );
}
export function wireAttachments(files: ChatAttachment[]) {
  return files.map(({ name, mimeType, data }) => ({ name, mimeType, data }));
}
export async function readFiles(
  files: File[],
  current: ChatAttachment[],
): Promise<ChatAttachment[]> {
  if (files.length + current.length > 4)
    throw new Error("Attach up to four files.");
  if (
    files.reduce(
      (size, file) => size + file.size,
      current.reduce((size, file) => size + attachmentBytes(file), 0),
    ) > attachmentLimit
  )
    throw new Error("Attachments must total 2 MB or less.");
  const added: ChatAttachment[] = [];
  for (const file of files) {
    if (!file.size) throw new Error(`${file.name} is empty.`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const image = ["image/png", "image/jpeg", "image/webp"].includes(file.type);
    if (!image) {
      if (
        (file.type &&
          !/\.(md|txt|csv|jsonl?|ya?ml|toml|xml|html?|css|[jt]sx?|py|rs|go|sh|sql|log)$/i.test(
            file.name,
          ) &&
          !/^(text\/|application\/(json|javascript|xml|toml|yaml|x-yaml|x-sh|octet-stream)$)/.test(
            file.type,
          )) ||
        file.size > 128 * 1024
      )
        throw new Error(
          "Use PNG, JPEG, WebP or UTF-8 text/code files up to 128 KB.",
        );
      let text: string;
      try {
        text = new TextDecoder("utf-8", {
          fatal: true,
          ignoreBOM: true,
        }).decode(bytes);
      } catch {
        throw new Error(`${file.name} is not UTF-8 text.`);
      }
      if (
        Array.from(text).some(
          (character) =>
            character.charCodeAt(0) < 32 &&
            ![9, 10, 13].includes(character.charCodeAt(0)),
        )
      )
        throw new Error(`${file.name} is a binary file.`);
    }
    let binary = "";
    for (let index = 0; index < bytes.length; index += 8192)
      binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
    added.push({
      id: crypto.randomUUID(),
      name: file.name,
      mimeType: image ? file.type : "text/plain",
      data: btoa(binary),
    });
  }
  return [...current, ...added];
}
