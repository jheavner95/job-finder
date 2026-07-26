"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import {
  createJobImportPreview,
  jobImportSchema,
  type JobImportInput,
  type JobImportPreview,
} from "@/lib/job-import";
import {
  findDuplicateJob,
  importJobPreview,
} from "@/lib/job-import-service";

export type ImportPreviewState = {
  values?: Partial<JobImportInput>;
  errors?: Record<string, string[]>;
  preview?: JobImportPreview;
  duplicate?: {
    id: string;
    title: string;
    company: string;
  } | null;
};

function valuesFrom(formData: FormData) {
  return Object.fromEntries(
    ["title", "company", "description", "url", "source", "salary", "location", "employmentType"].map(
      (key) => [key, String(formData.get(key) ?? "")],
    ),
  );
}

export async function previewJobAction(
  _previous: ImportPreviewState,
  formData: FormData,
): Promise<ImportPreviewState> {
  const values = valuesFrom(formData);
  const parsed = jobImportSchema.safeParse(values);
  if (!parsed.success) {
    return {
      values,
      errors: parsed.error.flatten().fieldErrors,
    };
  }
  const preview = createJobImportPreview(parsed.data);
  const duplicate = await findDuplicateJob(
    prisma,
    preview.normalized.fingerprint,
  );
  return {
    values: parsed.data,
    preview,
    duplicate: duplicate
      ? {
          id: duplicate.id,
          title: duplicate.title,
          company: duplicate.company.name,
        }
      : null,
  };
}

export async function importJobAction(formData: FormData) {
  const parsed = jobImportSchema.safeParse(valuesFrom(formData));
  if (!parsed.success) {
    throw new Error("The import changed after preview. Preview it again.");
  }
  const result = await importJobPreview(
    prisma,
    createJobImportPreview(parsed.data),
  );
  revalidatePath("/");
  revalidatePath("/review");
  revalidatePath(`/jobs/${result.jobId}`);
  redirect(`/jobs/${result.jobId}?import=${result.duplicate ? "duplicate" : "created"}`);
}
