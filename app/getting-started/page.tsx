import { redirect } from "next/navigation";

import { PageHeader } from "@/app/components/PageHeader";
import { prisma } from "@/lib/db";
import { ensureOnboarding, getOnboardingState, strings } from "@/lib/onboarding";

import { OnboardingWizard } from "./OnboardingWizard";

export const dynamic = "force-dynamic";

export default async function GettingStartedPage() {
  const state = await getOnboardingState(prisma);
  if (!state) redirect("/context");
  const onboarding = state.onboarding ?? await ensureOnboarding(prisma);
  const latestImport = state.resumeImports[0];
  const projectProgress = new Map(state.projectProgress.map((item) => [item.projectId, item]));
  const preferences = state.careerPreferences;
  const projects = [...state.portfolio].sort((left, right) =>
    right.portfolioReadiness - left.portfolioReadiness
    || left.name.localeCompare(right.name));

  return (
    <div className="page onboarding-page">
      <PageHeader
        title="Getting Started"
        subtitle="Build trustworthy Job Finder recommendations from information you review and approve."
        action={<span className="privacy-badge">● Private · stays on this Mac</span>}
      />
      <OnboardingWizard
        initialStep={onboarding.currentStep}
        completed={Boolean(onboarding.completedAt)}
        baselineReadiness={onboarding.baselineReadiness}
        currentReadiness={state.readiness}
        latestImport={latestImport ? {
          id: latestImport.id,
          fileName: latestImport.fileName,
          fileType: latestImport.fileType,
          status: latestImport.status,
          createdAt: latestImport.createdAt.toISOString(),
          sourceText: latestImport.sourceText,
          records: Array.isArray(latestImport.parsedEvidence) ? latestImport.parsedEvidence : [],
        } : null}
        importHistory={state.resumeImports.map((item) => ({
          id: item.id,
          fileName: item.fileName,
          fileType: item.fileType,
          status: item.status,
          createdAt: item.createdAt.toISOString(),
        }))}
        projects={projects.map((project) => {
          const progress = projectProgress.get(project.id);
          return {
            id: project.id,
            name: project.name,
            readiness: project.portfolioReadiness,
            status: progress?.status ?? "Needs evidence",
            notes: progress?.notes ?? "",
            screenshotName: progress?.screenshotName ?? "",
          };
        })}
        preferences={{
          preferredRoles: strings(preferences?.preferredRoles).join(", "),
          preferredIndustries: strings(preferences?.preferredIndustries).join(", "),
          workMode: preferences?.workMode ?? "",
          compensation: preferences?.compensation ?? "",
          companyExclusions: strings(preferences?.companyExclusions).join(", "),
          employmentTypes: strings(preferences?.employmentTypes).join(", "),
        }}
        resumeCount={state.resumeEvidence.length}
        capabilityCoverage={state.resumeReadiness?.capabilityCoverage ?? 0}
      />
    </div>
  );
}
