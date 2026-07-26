"use server";

import { revalidatePath } from "next/cache";

import { ensureOpportunityIntelligence } from "@/lib/candidate-intelligence/service";
import { prisma } from "@/lib/db";
import {
  CANDIDATE_ID,
  ensureOnboarding,
  getOnboardingState,
  parseResumeText,
  recalculateResumeEvidence,
} from "@/lib/onboarding";

async function extractText(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (extension === "md" || extension === "txt") {
    return new TextDecoder().decode(bytes);
  }
  if (extension === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return result.value;
  }
  if (extension === "pdf") {
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

async function setStep(step: number) {
  const onboarding = await ensureOnboarding(prisma);
  await prisma.candidateOnboarding.update({
    where: { id: onboarding.id },
    data: {
      currentStep: step,
      highestStep: Math.max(onboarding.highestStep, step),
    },
  });
  revalidatePath("/getting-started");
  revalidatePath("/context");
}

export async function goToOnboardingStep(step: number) {
  if (!Number.isInteger(step) || step < 1 || step > 5) throw new Error("Invalid onboarding step.");
  await setStep(step);
}

export async function uploadResume(formData: FormData) {
  await ensureOnboarding(prisma);
  const file = formData.get("resume");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a resume file first.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Resume files must be 10 MB or smaller.");
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!["pdf", "docx", "md", "txt"].includes(extension)) {
    throw new Error("Choose a PDF, DOCX, Markdown, or TXT file.");
  }
  const sourceText = (await extractText(file)).trim();
  if (!sourceText) throw new Error("No readable text was found in this file.");
  const parsed = parseResumeText(sourceText);
  const resumeImport = await prisma.candidateResumeImport.create({
    data: {
      profileId: CANDIDATE_ID,
      fileName: file.name,
      fileType: extension.toUpperCase(),
      sourceText,
      parsedEvidence: parsed,
    },
  });
  await setStep(2);
  return {
    id: resumeImport.id,
    fileName: resumeImport.fileName,
    sourceText,
    records: parsed,
  };
}

export async function rerunResumeExtraction(importId: string) {
  const resumeImport = await prisma.candidateResumeImport.findFirst({
    where: { id: importId, profileId: CANDIDATE_ID },
  });
  if (!resumeImport) throw new Error("Resume import was not found.");
  const records = parseResumeText(resumeImport.sourceText);
  await prisma.candidateResumeImport.update({
    where: { id: importId },
    data: { parsedEvidence: records, status: "Preview", approvedAt: null },
  });
  await setStep(2);
  return {
    id: resumeImport.id,
    fileName: resumeImport.fileName,
    fileType: resumeImport.fileType,
    status: "Preview",
    sourceText: resumeImport.sourceText,
    records,
  };
}

export async function approveResumeExperience(importId: string, recordsJson: string) {
  const resumeImport = await prisma.candidateResumeImport.findFirst({
    where: { id: importId, profileId: CANDIDATE_ID },
  });
  if (!resumeImport) throw new Error("Resume preview was not found.");
  const parsed = JSON.parse(recordsJson) as Array<{
    employer: string;
    title: string;
    startDate?: string | null;
    endDate?: string | null;
    responsibilities?: string[];
    leadership?: string[];
    domains?: string[];
    industries?: string[];
    products?: string[];
    technologies?: string[];
    methods?: string[];
    collaboration?: string[];
    research?: string[];
    accessibility?: string[];
    ai?: string[];
    designSystems?: string[];
    enterprise?: string[];
    sourceExcerpt?: string;
    evidenceQuality?: string;
    skipped?: boolean;
  }>;
  const approved = parsed.filter((item) => !item.skipped && item.employer.trim() && item.title.trim());
  await prisma.$transaction(async (transaction) => {
    await transaction.candidateResumeEvidence.deleteMany({ where: { profileId: CANDIDATE_ID } });
    if (approved.length) {
      await transaction.candidateResumeEvidence.createMany({
        data: approved.map((item) => ({
          profileId: CANDIDATE_ID,
          employer: item.employer.trim(),
          title: item.title.trim(),
          startDate: item.startDate?.trim() || null,
          endDate: item.endDate?.trim() || null,
          responsibilities: item.responsibilities ?? [],
          leadership: item.leadership ?? [],
          domains: item.domains ?? [],
          industries: item.industries ?? [],
          products: item.products ?? [],
          technologies: item.technologies ?? [],
          methods: item.methods ?? [],
          collaboration: item.collaboration ?? [],
          research: item.research ?? [],
          accessibility: item.accessibility ?? [],
          ai: item.ai ?? [],
          designSystems: item.designSystems ?? [],
          enterprise: item.enterprise ?? [],
          sourceDocument: resumeImport.fileName,
          sourceExcerpt: item.sourceExcerpt?.trim() || `${item.employer} — ${item.title}`,
          evidenceQuality: "Verified",
        })),
      });
    }
    await transaction.candidateResumeImport.update({
      where: { id: importId },
      data: { status: "Approved", approvedAt: new Date(), parsedEvidence: approved },
    });
  });
  await recalculateResumeEvidence(prisma);
  await ensureOpportunityIntelligence(prisma, { force: true });
  await setStep(3);
}

export async function saveProjectProgress(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const status = String(formData.get("status") ?? "Needs evidence");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const screenshot = formData.get("screenshot");
  const screenshotName = screenshot instanceof File && screenshot.size ? screenshot.name : null;
  if (!projectId) throw new Error("Project is required.");
  if (status === "Complete" && !notes && !screenshotName) {
    throw new Error("Add verified notes or a screenshot before marking a project complete.");
  }
  if (screenshot instanceof File && screenshot.size) {
    if (screenshot.size > 5 * 1024 * 1024) throw new Error("Screenshots must be 5 MB or smaller.");
    if (!["image/png", "image/jpeg", "image/webp"].includes(screenshot.type)) {
      throw new Error("Choose a PNG, JPEG, or WebP screenshot.");
    }
    const [{ mkdir, writeFile }, { join }] = await Promise.all([
      import("node:fs/promises"),
      import("node:path"),
    ]);
    const uploadDirectory = join(process.cwd(), ".local", "uploads", "portfolio");
    await mkdir(uploadDirectory, { recursive: true });
    const safeName = `${projectId.replaceAll(/[^a-zA-Z0-9_-]/g, "_")}-${screenshot.name.replaceAll(/[^a-zA-Z0-9._-]/g, "_")}`;
    await writeFile(join(uploadDirectory, safeName), new Uint8Array(await screenshot.arrayBuffer()));
  }
  await prisma.candidateProjectProgress.upsert({
    where: { profileId_projectId: { profileId: CANDIDATE_ID, projectId } },
    create: { profileId: CANDIDATE_ID, projectId, status, notes, screenshotName },
    update: { status, notes, ...(screenshotName ? { screenshotName } : {}) },
  });
  await ensureOpportunityIntelligence(prisma, { force: true });
  revalidatePath("/getting-started");
  revalidatePath("/evidence");
  revalidatePath("/");
  revalidatePath("/briefing");
  revalidatePath("/review");
}

export async function savePreferences(formData: FormData) {
  const list = (name: string) => String(formData.get(name) ?? "")
    .split(",").map((item) => item.trim()).filter(Boolean);
  await prisma.candidateCareerPreferences.upsert({
    where: { profileId: CANDIDATE_ID },
    create: {
      id: "primary-career-preferences",
      profileId: CANDIDATE_ID,
      preferredRoles: list("preferredRoles"),
      preferredIndustries: list("preferredIndustries"),
      workMode: String(formData.get("workMode") ?? "") || null,
      compensation: String(formData.get("compensation") ?? "") || null,
      companyExclusions: list("companyExclusions"),
      employmentTypes: list("employmentTypes"),
    },
    update: {
      preferredRoles: list("preferredRoles"),
      preferredIndustries: list("preferredIndustries"),
      workMode: String(formData.get("workMode") ?? "") || null,
      compensation: String(formData.get("compensation") ?? "") || null,
      companyExclusions: list("companyExclusions"),
      employmentTypes: list("employmentTypes"),
    },
  });
  await setStep(5);
}

export async function completeOnboarding() {
  const state = await getOnboardingState(prisma);
  if (!state) throw new Error("Candidate profile is not initialized.");
  const onboarding = await ensureOnboarding(prisma);
  await prisma.candidateOnboarding.update({
    where: { id: onboarding.id },
    data: {
      currentStep: 5,
      highestStep: 5,
      completedAt: new Date(),
      completionReadiness: state.readiness,
    },
  });
  revalidatePath("/");
  revalidatePath("/getting-started");
  revalidatePath("/context");
}
