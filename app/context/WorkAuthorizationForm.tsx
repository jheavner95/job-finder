import { JURISDICTIONS } from "@/lib/eligibility";
import type { CandidateEligibilityFacts } from "@/lib/eligibility/types";
import { saveEligibilityDeclaration } from "./eligibility-actions";

/**
 * The only place a work-authorization fact can enter the system.
 *
 * Job Finder cannot derive this. A résumé shows where someone has worked, not
 * where they may work; a job's location shows where the work happens, not who
 * may hold it. So it is asked for plainly, and until it is answered every
 * constrained role is marked "review required" rather than guessed at.
 */
export function WorkAuthorizationForm({ facts }: { facts: CandidateEligibilityFacts | null }) {
  const codes = facts?.authorizedCountries ?? [];
  const suggestions = JURISDICTIONS.filter((item) => !item.isBloc).slice(0, 12);

  return (
    <section className="career-section work-authorization" id="work-authorization">
      <div className="career-section-heading">
        <div>
          <p className="eyebrow">Eligibility · does not affect your match scores</p>
          <h2>Work authorization</h2>
        </div>
        <p>
          Used only to flag postings that state a requirement you cannot meet. Leave it blank and
          those postings are marked for your review instead.
        </p>
      </div>

      <form className="preference-form" action={saveEligibilityDeclaration}>
        <label>
          Countries you are authorized to work in
          <input
            name="authorizedCountries"
            defaultValue={codes.join(", ")}
            placeholder="US, CA"
            list="jurisdiction-codes"
          />
          <small>
            Two-letter country codes, comma separated. Recognised:{" "}
            {suggestions.map((item) => item.code).join(", ")}…
          </small>
        </label>
        <datalist id="jurisdiction-codes">
          {JURISDICTIONS.map((item) => (
            <option key={item.code} value={item.code}>
              {item.label}
            </option>
          ))}
        </datalist>

        <label className="checkbox-label">
          <input type="checkbox" name="declarationComplete" defaultChecked={facts?.declarationComplete} />
          <span>
            This list is complete
            <small>
              Only with this ticked can a posting be marked ineligible. Without it, a country you
              did not list is treated as unknown, not as a refusal.
            </small>
          </span>
        </label>

        <button className="primary-button" type="submit">
          Save and re-check opportunities
        </button>
      </form>
    </section>
  );
}
