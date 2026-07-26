export async function extractResumeFileText(
  fileName: string,
  bytes: Uint8Array,
) {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "md" || extension === "txt") {
    return new TextDecoder().decode(bytes);
  }
  if (extension === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return result.value;
  }
  if (extension === "pdf") {
    await import("pdf-parse/worker");
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: bytes });
    try {
      return (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  }
  throw new Error("Choose a PDF, DOCX, Markdown, or TXT file.");
}
