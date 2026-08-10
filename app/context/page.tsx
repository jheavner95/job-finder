import Link from "next/link";

import { PageHeader } from "@/app/components/PageHeader";
import { ReadingLayout } from "@/app/components/PageLayout";
import { prisma } from "@/lib/db";
import { loadProfile, type ProfileFact } from "@/lib/profile";

import { RoleTrackForm } from "./RoleTrackForm";
import { TargetsForm } from "./TargetsForm";
import { WorkAuthorizationForm } from "./WorkAuthorizationForm";
import { WorkPreferencesForm } from "./WorkPreferencesForm";

export const dynamic = "force-dynamic";

/**
 * Your Profile — one place for what Job Finder knows about you.
 *
 * Replaces a Career Profile page that opened with "Profile strength 49%", a
 * figure counting context documents rather than describing a career, followed
 * by a task list, two forms, and two panels explaining the recommendation
 * engine to its own user. The things a person actually changes — the roles they
 * want, the industries, how they want to work, what they are paid — were not
 * on it at all; they lived inside the first-run onboarding wizard.
 *
 * The order is the order of the questions: who am I targeting, how do I want to
 * work, what may I take, what does Job Finder have on me, what should I fix.
 */
export default async function ProfilePage() {
  const profile = await loadProfile(prisma);
  const material = profile.gaps.filter((gap) => gap.material);

  return (
    <ReadingLayout className="career-page profile-workspace">
      <PageHeader
        title="Your Profile"
        subtitle={`What Job Finder knows about you, and what it uses to judge a role.`}
        action={<span className="privacy-badge">● Local files · private workspace</span>}
      />

      {/* The first viewport: who you are targeting, at what level, how you want
          to work, and whether anything important is missing. */}
      <section className="profile-summary" aria-labelledby="profile-summary-title">
        <h2 id="profile-summary-title" className="sr-only">
          At a glance
        </h2>
        <dl>
          <div>
            <dt>Targeting</dt>
            <dd>{profile.targets.roles.length ? profile.targets.roles.join(" · ") : "No roles set"}</dd>
          </div>
          <div>
            <dt>Level</dt>
            <dd>
              {profile.targets.level.value ?? "Not set"}
              <Derived fact={profile.targets.level} />
            </dd>
          </div>
          <div>
            <dt>Work mode</dt>
            <dd>{profile.work.mode ?? "No preference"}</dd>
          </div>
          <div>
            <dt>Can work in</dt>
            <dd>
              {profile.eligibility.declared
                ? profile.eligibility.facts?.authorizedCountries.join(", ")
                : "Not stated"}
            </dd>
          </div>
        </dl>
        {profile.gaps.length > 0 && (
          <p className={material.length ? "profile-gaps is-material" : "profile-gaps"}>
            {/* No meter, no percentage. A short list of things that change a
                result, and nothing when there is nothing to say. */}
            <strong>
              {profile.gaps.length === 1 ? "One thing" : `${profile.gaps.length} things`} would
              sharpen your recommendations
            </strong>
            <a href="#improve">See what</a>
          </p>
        )}
      </section>

      <section className="career-section" id="targets" aria-labelledby="targets-title">
        <div className="career-section-heading">
          <div>
            <h2 id="targets-title">What you are looking for</h2>
          </div>
          <p>The roles and product areas Job Finder searches for on your behalf.</p>
        </div>
        <TargetsForm roles={profile.targets.roles} industries={profile.targets.industries} />
      </section>

      <section className="career-section" id="work-preferences" aria-labelledby="work-title">
        <div className="career-section-heading">
          <div>
            <h2 id="work-title">How you want to work</h2>
          </div>
          <p>Preferences, not requirements. A role outside them is shown, with a note.</p>
        </div>
        <WorkPreferencesForm
          mode={profile.work.mode}
          employmentTypes={profile.work.employmentTypes}
          compensation={profile.work.compensation}
          exclusions={profile.work.exclusions}
        />
      </section>

      <RoleTrackForm profile={profile.levelProfile} />

      <WorkAuthorizationForm facts={profile.eligibility.facts} />

      <section className="career-section" id="knows" aria-labelledby="knows-title">
        <div className="career-section-heading">
          <div>
            <h2 id="knows-title">What Job Finder has evidence for</h2>
          </div>
          <p>
            Read from your résumé and portfolio. {profile.evidence.resumeRecords} employment{" "}
            {profile.evidence.resumeRecords === 1 ? "record" : "records"} and{" "}
            {profile.evidence.portfolioProjects}{" "}
            {profile.evidence.portfolioProjects === 1 ? "project" : "projects"}.
          </p>
        </div>
        {profile.evidence.areas.length ? (
          <ul className="profile-evidence">
            {profile.evidence.areas.map((area) => (
              <li key={area.category}>
                <strong>{area.category}</strong>
                <span>{area.labels.join(", ")}</span>
                {/* Stated, because a claim the résumé only implies supports a
                    weaker recommendation than one it states outright. */}
                <small>
                  {area.confirmed > 0 && `${area.confirmed} confirmed`}
                  {area.confirmed > 0 && area.partial > 0 && " · "}
                  {area.partial > 0 && `${area.partial} mentioned in passing`}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="profile-help">
            Nothing yet. <Link href="/getting-started">Import a résumé</Link> to start.
          </p>
        )}
        <p className="profile-help">
          <Link href="/evidence">See every claim and its source</Link>
        </p>
      </section>

      <section className="career-section" id="improve" aria-labelledby="improve-title">
        <div className="career-section-heading">
          <div>
            <h2 id="improve-title">What to improve</h2>
          </div>
        </div>
        {profile.gaps.length ? (
          <ul className="profile-improve">
            {profile.gaps.map((gap) => (
              <li key={gap.id}>
                <a href={gap.href}>{gap.label}</a>
                <span>{gap.effect}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="profile-help">
            Nothing is missing. Job Finder has what it needs to judge a role for you.
          </p>
        )}
      </section>

      {/* Low-frequency and read-only. Present, not prominent. */}
      <details className="profile-more">
        <summary>Other things Job Finder reads</summary>
        <ul>
          <li>
            <Link href="/context/writing-voice">Writing voice</Link>
            <span>Kept from a local file. Used only for writing help, not for matching.</span>
          </li>
          <li>
            <Link href="/evidence">Career evidence</Link>
            <span>Every claim, its source document, and how strongly it is supported.</span>
          </li>
          <li>
            <Link href="/getting-started">Résumé import</Link>
            <span>Re-import or re-approve employment records.</span>
          </li>
        </ul>
      </details>
    </ReadingLayout>
  );
}

/** A quiet marker distinguishing what you told Job Finder from what it worked out. */
function Derived({ fact }: { fact: ProfileFact }) {
  if (fact.source !== "derived" || !fact.value) return null;
  return <em className="profile-derived"> — {fact.from}</em>;
}
