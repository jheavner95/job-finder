import { LEVEL_LABEL } from "@/lib/level-fit/ladder";
import type { CandidateLevelProfile } from "@/lib/level-fit/types";
import { targetBand } from "@/lib/level-fit";
import { saveRoleTrackPreference } from "./level-actions";

/**
 * The one thing level fit cannot derive.
 *
 * Target level comes from the roles already listed in career preferences, and
 * current level from the résumé. Whether the candidate wants to manage people
 * is in neither, and it is not implied by fifteen years of experience — so it
 * is asked for, and until it is answered no track mismatch is ever claimed.
 */
const OPTIONS = [
  { value: "", label: "Not stated — don't flag track mismatches" },
  { value: "individual-contributor", label: "Individual contributor" },
  { value: "player-coach", label: "Player-coach (hands-on with some leadership)" },
  { value: "people-management", label: "People management" },
  { value: "executive-leadership", label: "Executive leadership" },
];

export function RoleTrackForm({ profile }: { profile: CandidateLevelProfile }) {
  const band = targetBand(profile);

  return (
    <section className="career-section role-track" id="role-track">
      <div className="career-section-heading">
        <div>
          <p className="eyebrow">Level fit · does not affect your match scores</p>
          <h2>Career level and track</h2>
        </div>
        <p>
          Used to flag roles that sit below or above your career level. Your level target is read
          from the roles you already listed; only the track needs answering.
        </p>
      </div>

      <dl className="level-derived">
        <div>
          <dt>Target level</dt>
          <dd>{band ? `${LEVEL_LABEL[band.min]} – ${LEVEL_LABEL[band.max]}` : "Not derivable from your preferred roles"}</dd>
        </div>
        <div>
          <dt>Current level</dt>
          <dd>{LEVEL_LABEL[profile.currentLevel]}</dd>
        </div>
        <div>
          <dt>Years of experience</dt>
          <dd>{profile.yearsExperience === null ? "Not recorded" : `${profile.yearsExperience} years`}</dd>
        </div>
      </dl>

      <form className="preference-form" action={saveRoleTrackPreference}>
        <label>
          Role track
          <select name="trackPreference" defaultValue={profile.trackPreference ?? ""}>
            {OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <small>
            A management role is not treated as a promotion from an IC role. Leaving this unset
            means no role is ever flagged for its track.
          </small>
        </label>
        <button className="primary-button" type="submit">
          Save and re-check opportunities
        </button>
      </form>
    </section>
  );
}
