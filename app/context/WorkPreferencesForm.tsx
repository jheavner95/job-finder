import { SubmitButton } from "@/app/components/SubmitButton";

import { saveWorkPreferences } from "./preference-actions";

/**
 * How you want to work.
 *
 * Work mode stays a preference, never part of the craft-match score: a remote
 * role and an on-site role can be equally good design jobs, and DE-3L found
 * that folding location into the score punished postings for saying where the
 * work happens. Pay is here because a target is already stored; Job Finder
 * cannot compare it to a salary most postings never publish.
 */

const MODES = [
  { value: "", label: "No preference" },
  { value: "Remote", label: "Remote" },
  { value: "Hybrid", label: "Hybrid" },
  { value: "Remote or Hybrid", label: "Remote or hybrid" },
  { value: "On-site", label: "On-site" },
];

export function WorkPreferencesForm({
  mode,
  employmentTypes,
  compensation,
  exclusions,
}: {
  mode: string | null;
  employmentTypes: string[];
  compensation: string | null;
  exclusions: string[];
}) {
  return (
    <form className="profile-form" action={saveWorkPreferences}>
      <div className="profile-form-row">
        <label htmlFor="workMode">
          Work mode
          <select id="workMode" name="workMode" defaultValue={mode ?? ""}>
            {MODES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label htmlFor="employmentTypes">
          Employment type
          <input
            id="employmentTypes"
            name="employmentTypes"
            defaultValue={employmentTypes.join(", ")}
            placeholder="Full time, contract"
          />
        </label>
      </div>

      <label htmlFor="compensation">
        Target compensation
        <input
          id="compensation"
          name="compensation"
          defaultValue={compensation ?? ""}
          placeholder="$180k – $250k"
          aria-describedby="compensation-help"
        />
      </label>
      <p className="profile-help" id="compensation-help">
        {/* Honest about the limit: most postings do not publish a range, so
            this is a note to yourself rather than something to filter on. */}
        Recorded for your reference. Most postings do not state a salary, so Job Finder cannot
        compare roles against this.
      </p>

      <label htmlFor="companyExclusions">
        Companies to skip
        <input
          id="companyExclusions"
          name="companyExclusions"
          defaultValue={exclusions.join(", ")}
          placeholder="Optional, comma separated"
        />
      </label>

      <SubmitButton pendingLabel="Saving…">Save preferences</SubmitButton>
    </form>
  );
}
