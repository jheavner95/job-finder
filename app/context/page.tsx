import Link from "next/link";

import { PageHeader } from "@/app/components/PageHeader";
import { ReadingLayout } from "@/app/components/PageLayout";
import {
  careerProfileTasks,
  estimatedProfileMinutes,
  profileQuality,
} from "@/lib/career-profile-presentation";
import { evaluateContextLibrary } from "@/lib/context-readiness";
import { prisma } from "@/lib/db";
import { getOnboardingState, strings } from "@/lib/onboarding";
import { loadCandidateFacts } from "@/lib/eligibility/service";
import { WorkAuthorizationForm } from "./WorkAuthorizationForm";
import { RoleTrackForm } from "./RoleTrackForm";
import { loadCandidateLevelProfile } from "@/lib/level-fit/service";

export const dynamic = "force-dynamic";

export default async function ContextPage() {
  const readiness = await evaluateContextLibrary();
  const eligibilityFacts = await loadCandidateFacts(prisma);
  const levelProfile = await loadCandidateLevelProfile(prisma);
  const onboarding = await getOnboardingState(prisma);
  const sourceTasks = careerProfileTasks(readiness.documents);
  const onboardingStep = onboarding?.onboarding?.currentStep ?? 1;
  const preferences = onboarding?.careerPreferences;
  const tasks = sourceTasks.map((task) => {
    let status = task.status;
    if (task.id === "master-resume" && (onboarding?.resumeEvidence.length || onboarding?.resumeImports.length)) status = "ready";
    if (task.id === "career-profile" && (onboardingStep > 2 || onboarding?.onboarding?.completedAt)) status = "ready";
    if (task.id === "portfolio-evidence") {
      status = onboarding?.portfolioReadiness
        ? onboarding.portfolioReadiness >= 80 ? "ready" : "partial"
        : onboarding?.portfolio.length ? "template" : status;
    }
    if (task.id === "compensation" && preferences?.compensation) status = "ready";
    if (task.id === "role-requirements" && strings(preferences?.preferredIndustries).length) status = "ready";
    if (task.id === "company-preferences" && (
      strings(preferences?.preferredRoles).length
      || preferences?.workMode
      || strings(preferences?.employmentTypes).length
    )) status = "ready";
    if (task.id === "exclusions" && strings(preferences?.companyExclusions).length) status = "ready";
    return {
      ...task,
      status,
      statusLabel: status === "ready" ? "Complete" : status === "partial" ? "In progress" : status === "template" ? "Needs review" : "Not started",
    };
  });
  const incomplete = tasks.filter((task) => task.status !== "ready");
  const completed = tasks.filter((task) => task.status === "ready");
  const projectStatus = new Map(onboarding?.projectProgress.map((item) => [item.projectId, item.status]) ?? []);
  const project = onboarding?.portfolio
    .filter((item) => item.portfolioReadiness < 100 && projectStatus.get(item.id) !== "Complete")
    .sort((left, right) => right.portfolioReadiness - left.portfolioReadiness)[0];
  const nextTask = project
    ? {
        label: `Complete ${project.name} project`,
        href: "/getting-started?step=3",
        reason: "Adds verified project evidence that improves role, product, and industry recommendations.",
      }
    : incomplete[0]
      ? {
          label: incomplete[0].label,
          href: incomplete[0].href,
          reason: incomplete[0].benefit,
        }
      : null;
  const remainingMinutes = estimatedProfileMinutes(tasks);
  const quality = profileQuality(readiness.percentage);

  return (
    <ReadingLayout className="career-page profile-workspace">
      <PageHeader
        title="Career Profile"
        subtitle="Complete the information Job Finder uses to make recommendations more relevant and explainable."
        action={<span className="privacy-badge">● Local files · private workspace</span>}
      />

      <section className="profile-hero" aria-labelledby="profile-strength-title">
        <div className="profile-strength">
          <p className="eyebrow" id="profile-strength-title">Profile Strength</p>
          <strong>{readiness.percentage}%</strong>
          <span>{readiness.calibrated ? "Ready" : "In progress"}</span>
        </div>
        {nextTask ? (
          <div className="profile-next-action">
            <p className="eyebrow">Next recommended action</p>
            <h2>{nextTask.label}</h2>
            <dl>
              <div><dt>Estimated time remaining</dt><dd>{remainingMinutes} minutes</dd></div>
              <div><dt>Why?</dt><dd>{nextTask.reason}</dd></div>
            </dl>
            <div className="profile-hero-actions">
              <Link className="primary-button button-link" href={nextTask.href}>Continue</Link>
              <a className="secondary-button button-link" href="#completed-profile-items">View completed items</a>
            </div>
          </div>
        ) : (
          <div className="profile-next-action profile-ready">
            <p className="eyebrow">Profile ready</p>
            <h2>Your career profile is ready.</h2>
            <p>Job Finder has enough verified evidence to produce high-confidence recommendations.</p>
            <Link className="primary-button button-link" href="/review">Review opportunities</Link>
          </div>
        )}
        <dl className="profile-secondary-metrics">
          <div><dt>Evidence confidence</dt><dd>{quality}</dd></div>
          <div><dt>Recommendation quality</dt><dd>{quality}</dd></div>
        </dl>
      </section>

      <section className="career-section" aria-labelledby="profile-checklist-title">
        <div className="career-section-heading">
          <div><p className="eyebrow">Recommended next steps</p><h2 id="profile-checklist-title">Complete Your Profile</h2></div>
          <p>Each task explains how it improves your recommendations.</p>
        </div>
        {incomplete.length ? (
          <ol className="profile-checklist">
            {incomplete.map((task) => (
              <li key={task.id}>
                <span className={`profile-task-state readiness-${task.status}`} aria-label={task.statusLabel}>
                  {task.status === "partial" ? "◐" : "○"}
                </span>
                <div>
                  <span className={`readiness-pill readiness-${task.status}`}>{task.statusLabel}</span>
                  <h3>{task.label}</h3>
                  <p>{task.benefit}</p>
                </div>
                <span className="profile-task-time">{task.minutes} min</span>
                <Link className="secondary-button button-link" href={task.href}>Continue</Link>
              </li>
            ))}
          </ol>
        ) : (
          <div className="career-empty"><strong>Everything is complete.</strong><p>Your profile is ready to maintain as your career changes.</p></div>
        )}
      </section>

      <RoleTrackForm profile={levelProfile} />

      <WorkAuthorizationForm facts={eligibilityFacts} />

      <details className="completed-profile-items" id="completed-profile-items">
        <summary>Completed ({completed.length})</summary>
        {completed.length ? (
          <ul>
            {completed.map((task) => (
              <li key={task.id}><span aria-hidden="true">✓</span><strong>{task.label}</strong><Link href={task.href}>Review</Link></li>
            ))}
          </ul>
        ) : <p>No profile tasks are complete yet.</p>}
      </details>

      <details className="understanding-profile">
        <summary>Understanding Your Profile</summary>
        <div>
          <section>
            <h2>Why confidence may be limited</h2>
            <p>Profile gaps reduce certainty; they do not lower your professional value or directly deduct points from a job’s match score.</p>
          </section>
          <section>
            <h2>How Job Finder uses your information</h2>
            <p>Verified evidence stays local, unknown information remains unknown, and every recommendation must remain explainable.</p>
          </section>
        </div>
      </details>
    </ReadingLayout>
  );
}
