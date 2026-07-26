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
import { mapError, type AppError } from "@/lib/errors/app-error";
import { logAppError } from "@/lib/errors/logger";

export type ImportPreviewState = {
  values?: Partial<JobImportInput>;
  errors?: Record<string, string[]>;
  preview?: JobImportPreview;
  duplicate?: {
    id: string;
    title: string;
    company: string;
  } | null;
  actionError?: AppError;
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
  try {
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
  } catch (cause) {
    const error = mapError(cause, { route: "/import", operation: "preview-job" });
    await logAppError(error, cause, { operation: "preview-job", route: "/import" });
    return { values: parsed.data, actionError: error };
  }
}

export async function importJobAction(formData: FormData) {
  const parsed = jobImportSchema.safeParse(valuesFrom(formData));
  if (!parsed.success) {
    throw new Error("The import changed after preview. Preview it again.");
  }
  let result;
  try {
    result = await importJobPreview(
      prisma,
      createJobImportPreview(parsed.data),
    );
  } catch (cause) {
    const error = mapError(cause, { route: "/import", operation: "import-job" });
    await logAppError(error, cause, { operation: "import-job", route: "/import" });
    throw new Error(`${error.code}:${error.diagnosticId}`);
  }
  revalidatePath("/");
  revalidatePath("/review");
  revalidatePath(`/jobs/${result.jobId}`);
  redirect(`/jobs/${result.jobId}?import=${result.duplicate ? "duplicate" : "created"}`);
}
