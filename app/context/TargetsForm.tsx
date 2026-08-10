import { SubmitButton } from "@/app/components/SubmitButton";

import { saveTargetPreferences } from "./preference-actions";

/**
 * What you are looking for.
 *
 * Roles are free text because they are matched as titles, and because the
 * market's vocabulary moves faster than any list we could ship — "Agent
 * Experience Designer" and "Conversation Designer" did not exist as categories
 * two years ago. Industries are the same field the engine reads for domain
 * affinity, so "AI Products" is expressible here today.
 */
export function TargetsForm({
  roles,
  industries,
}: {
  roles: string[];
  industries: string[];
}) {
  return (
    <form className="profile-form" action={saveTargetPreferences}>
      <label htmlFor="preferredRoles">
        Roles you are targeting
        <input
          id="preferredRoles"
          name="preferredRoles"
          defaultValue={roles.join(", ")}
          placeholder="Senior Product Designer, Staff Product Designer"
          aria-describedby="preferredRoles-help"
        />
      </label>
      <p className="profile-help" id="preferredRoles-help">
        Comma separated. These decide which seniority Job Finder treats as the right level for
        you, so include every title you would take.
      </p>

      <label htmlFor="preferredIndustries">
        Industries and product areas
        <input
          id="preferredIndustries"
          name="preferredIndustries"
          defaultValue={industries.join(", ")}
          placeholder="Enterprise Software, FinTech, AI Products"
          aria-describedby="preferredIndustries-help"
        />
      </label>
      <p className="profile-help" id="preferredIndustries-help">
        Comma separated. Used to recognise the kind of product a role is for.
      </p>

      <SubmitButton pendingLabel="Saving…">Save and re-check opportunities</SubmitButton>
    </form>
  );
}
