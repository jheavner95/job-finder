import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { extractResumeFileText } from "../lib/candidate-intelligence/resume-file";
import { parseResumeStructure } from "../lib/candidate-intelligence/resume-structure";

const encoder = new TextEncoder();

function createTextPdf(text: string) {
  const escaped = text.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
  const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) =>
    `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return encoder.encode(pdf);
}

async function createTextDocx(text: string) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    </Types>`);
  zip.folder("_rels")?.file(".rels", `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    </Relationships>`);
  zip.folder("word")?.file("document.xml", `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body>
    </w:document>`);
  return zip.generateAsync({ type: "uint8array" });
}

describe("resume file text extraction", () => {
  it("imports Markdown", async () => {
    const text = await extractResumeFileText(
      "resume.md",
      encoder.encode("# Resume\n\nEXPERIENCE\n\nAcorn Labs — Product Designer"),
    );
    expect(parseResumeStructure(text).experience[0]).toMatchObject({
      employer: "Acorn Labs",
      title: "Product Designer",
    });
  });

  it("imports TXT", async () => {
    const text = await extractResumeFileText(
      "resume.txt",
      encoder.encode("WORK HISTORY\n\nProduct Designer | Birch Systems"),
    );
    expect(parseResumeStructure(text).experience[0]).toMatchObject({
      employer: "Birch Systems",
      title: "Product Designer",
    });
  });

  it("imports PDF", async () => {
    const text = await extractResumeFileText(
      "resume.pdf",
      createTextPdf("Cedar Works | Senior Product Designer"),
    );
    expect(parseResumeStructure(text).experience[0]).toMatchObject({
      employer: "Cedar Works",
      title: "Senior Product Designer",
    });
  });

  it("imports DOCX", async () => {
    const text = await extractResumeFileText(
      "resume.docx",
      await createTextDocx("Principal Product Designer — Dogwood Software"),
    );
    expect(parseResumeStructure(text).experience[0]).toMatchObject({
      employer: "Dogwood Software",
      title: "Principal Product Designer",
    });
  });
});
