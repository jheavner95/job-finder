import { describe, expect, it } from "vitest";

import {
  assessEligibility,
  boilerplateReason,
  buildCandidateFacts,
  detectPostingConstraints,
  parseCandidateFacts,
  segmentSentences,
  type PostingConstraint,
} from "../lib/eligibility";

/**
 * Every posting string below is verbatim from the 428-job corpus audited in
 * DE-3D. Invented wording would test the regex, not the problem.
 */

function detect(description: string, title = "Product Designer", requirements: string[] = []) {
  return detectPostingConstraints({ title, description, requirements });
}

function ofType(constraints: PostingConstraint[], type: string) {
  return constraints.filter((item) => item.type === type);
}

const US_ONLY = buildCandidateFacts(["US"], true, new Date("2026-08-09T00:00:00Z"));
const US_PARTIAL = buildCandidateFacts(["US"], false, new Date("2026-08-09T00:00:00Z"));

describe("sentence segmentation", () => {
  it("keeps 'U.S.' from ending a sentence", () => {
    // The IonQ export-control requirement was previously split in half here.
    const parts = segmentSentences(
      "Due to applicable export control laws and regulations, candidates must be a U.S. citizen or national, U.S. permanent resident, or lawfully admitted. Apply today.",
    );
    expect(parts).toHaveLength(2);
    expect(parts[0].text).toContain("U.S. citizen or national");
  });

  it("preserves the offset of each sentence in the source text", () => {
    const text = "First sentence. Must be authorized to work in the United States.";
    const parts = segmentSentences(text);
    expect(text.slice(parts[1].offset)).toBe(parts[1].text);
  });
});

describe("explicit nationality requirement", () => {
  const deliveroo = "PLEASE NOTE WE CAN ONLY ACCEPT APPLICATIONS FROM KUWAITI NATIONALS FOR THIS ROLE.";

  it("detects it in the description", () => {
    const [constraint] = ofType(detect(deliveroo), "citizenship");
    expect(constraint.classification).toBe("HARD");
    expect(constraint.jurisdiction).toBe("KW");
    expect(constraint.evidence).toContain("KUWAITI NATIONALS");
  });

  it("detects it in the title alone", () => {
    const found = detect("A design role.", "Junior Designer - Kuwaiti National Only");
    const [constraint] = ofType(found, "citizenship");
    expect(constraint.jurisdiction).toBe("KW");
    expect(constraint.field).toBe("title");
  });
});

describe("explicit citizenship and export-control requirements", () => {
  const ionq =
    "Due to applicable export control laws and regulations, candidates must be a U.S. citizen or national, U.S. permanent resident (i.e., current Green Card holder), or lawfully admitted into the U.S.";

  it("classifies the person requirement as HARD against the United States", () => {
    const [constraint] = ofType(detect(ionq), "export-control");
    expect(constraint.classification).toBe("HARD");
    expect(constraint.jurisdiction).toBe("US");
  });

  it("treats a bare export-control mention as LIKELY, not HARD", () => {
    const [constraint] = ofType(
      detect("This position requires access to technology subject to export control laws."),
      "export-control",
    );
    expect(constraint.classification).toBe("LIKELY");
  });

  it("never clears export control from work authorization alone", () => {
    // Authorization to work in the US does not make someone a "U.S. Person".
    const assessment = assessEligibility(detect(ionq), US_ONLY);
    expect(assessment.verdict).toBe("REVIEW_REQUIRED");
  });
});

describe("right-to-work requirement", () => {
  const addepar =
    "Applicants must have, and maintain, the right to work in the United Kingdom from the first day of employment. Please note that visa sponsorship is not available for this role.";

  it("resolves the named country through intervening commas", () => {
    const [constraint] = ofType(detect(addepar), "right-to-work");
    expect(constraint.classification).toBe("HARD");
    expect(constraint.jurisdiction).toBe("GB");
  });

  it("excludes a candidate whose complete declaration omits that country", () => {
    const assessment = assessEligibility(detect(addepar), US_ONLY);
    expect(assessment.verdict).toBe("INELIGIBLE");
    expect(assessment.blocking[0].jurisdictionLabel).toBe("United Kingdom");
  });

  it("only asks for review when the declaration is not marked complete", () => {
    const assessment = assessEligibility(detect(addepar), US_PARTIAL);
    expect(assessment.verdict).toBe("REVIEW_REQUIRED");
    expect(assessment.blocking).toHaveLength(0);
  });

  it("downgrades a preference-framed requirement to LIKELY", () => {
    // OKX states a priority, not a bar. DE-3D read this as hard; the text does not.
    const okx =
      "OKX will be prioritising applicants who have a current right to work in Singapore, and do not require OKX's sponsorship of a visa.";
    const [constraint] = ofType(detect(okx), "right-to-work");
    expect(constraint.classification).toBe("LIKELY");
    expect(constraint.jurisdiction).toBe("SG");
  });
});

describe("sponsorship statements", () => {
  it("detects an explicit refusal without treating it as an independent bar", () => {
    const serhant =
      "At this time, we are not able to offer H-1B visa or any other work authorization sponsorship.";
    const constraints = detect(serhant);
    expect(ofType(constraints, "sponsorship-unavailable")).toHaveLength(1);
    // Nobody is excluded by a refusal alone — only by an unmet requirement.
    expect(assessEligibility(constraints, US_ONLY).verdict).toBe("NO_CONSTRAINT_FOUND");
  });

  it("hardens an otherwise soft requirement when sponsorship is refused", () => {
    const okxWithRefusal =
      "OKX will be prioritising applicants who have a current right to work in Singapore. Visa sponsorship is not available for this role.";
    const assessment = assessEligibility(detect(okxWithRefusal), US_ONLY);
    expect(assessment.verdict).toBe("INELIGIBLE");
  });

  it("reads an offer of sponsorship as informational, never as a refusal", () => {
    for (const text of [
      "Visa sponsorship: We do sponsor visas!",
      "✅ We can sponsor your visa.",
      "We can sponsor visas to Germany;",
      "Up to €10,000 for relocation to Paris, including apartment search and visa assistance",
    ]) {
      const constraints = detect(text);
      expect(ofType(constraints, "sponsorship-unavailable"), text).toHaveLength(0);
      expect(ofType(constraints, "sponsorship-available"), text).toHaveLength(1);
    }
  });
});

describe("residency requirement", () => {
  it("detects a named residency requirement", () => {
    const [constraint] = ofType(
      detect("Candidates must reside in Canada for the duration of the contract."),
      "residency",
    );
    expect(constraint.classification).toBe("HARD");
    expect(constraint.jurisdiction).toBe("CA");
  });

  it("does not infer a requirement from a location field or a city mention", () => {
    // A place the work happens is not a rule about who may hold the job.
    const constraints = detectPostingConstraints({
      title: "Senior Product Designer",
      description: "This hybrid role is based in our Chicago studio, three days a week.",
      requirements: ["8+ years of product design experience"],
    });
    expect(constraints).toHaveLength(0);
  });
});

describe("EEO and boilerplate protection", () => {
  const eeoCitizenship =
    "voize welcomes people from all different backgrounds, including age, citizenship, ethnic and racial origins, gender identities, individuals with disabilities, marital status, religions and ideologies, and sexual orientations to apply.";
  const eeoNationalOrigin =
    "All applicants are considered without regards to race, color, religion, national origin, age, sex, marital status, ancestry, physical or mental disability, veteran status, or sexual orientation.";

  it("classifies an EEO citizenship mention as boilerplate", () => {
    expect(boilerplateReason(eeoCitizenship)).toBe("anti-discrimination-frame");
    expect(assessEligibility(detect(eeoCitizenship), US_ONLY).verdict).toBe("NO_CONSTRAINT_FOUND");
  });

  it("classifies an EEO national-origin mention as boilerplate", () => {
    expect(boilerplateReason(eeoNationalOrigin)).toBe("anti-discrimination-frame");
    expect(assessEligibility(detect(eeoNationalOrigin), US_ONLY).verdict).toBe("NO_CONSTRAINT_FOUND");
  });

  it("catches a protected-class list that carries no disclaiming phrase", () => {
    // The frame can be absent; three or more protected characteristics in one
    // sentence is an enumeration, and enumerations are not requirements.
    expect(
      boilerplateReason(
        "Employment decisions are made on merit: race, colour, religion, sex, age and disability play no part.",
      ),
    ).toBe("protected-class-enumeration");
  });

  it("treats an E-Verify notice as informational despite the requirement wording", () => {
    const wpromote =
      "This employer participates in E-Verify and will provide the federal government with your Form I-9 information to confirm that you are authorized to work in the U.S.";
    expect(boilerplateReason(wpromote)).toBe("statutory-notice");
    const constraints = detect(wpromote);
    expect(constraints.every((item) => item.classification === "INFORMATIONAL")).toBe(true);
  });

  it("treats a conditional export-control disclosure as informational", () => {
    // Databricks discloses that a rule might apply; it does not impose one.
    const databricks =
      "If access to export-controlled technology or source code is required for performance of job duties, it is within Employer's discretion whether to apply for a licence.";
    expect(boilerplateReason(databricks)).toBe("conditional-disclosure");
    expect(assessEligibility(detect(databricks), null).verdict).toBe("NO_CONSTRAINT_FOUND");
  });

  it("keeps a definite export-control statement out of the conditional bucket", () => {
    const ionq =
      "The position you are applying for will require access to technology that is subject to U.S. export control and government contract restrictions.";
    expect(boilerplateReason(ionq)).toBeNull();
    expect(ofType(detect(ionq), "export-control")[0].classification).toBe("LIKELY");
  });

  it("treats standard contingent-offer wording as informational", () => {
    const samsara =
      "All offers of employment are contingent upon an individual's ability to secure and maintain the legal right to work at the company and in the specified work location, if applicable.";
    expect(boilerplateReason(samsara)).toBe("contingent-offer");
  });

  it("does not fire on prose that merely contains the trigger words", () => {
    // Every one of these appears in the corpus and would break a keyword rule.
    for (const text of [
      "The national base pay range for this position within the United States is $165,000.00 - $185,000.00 USD.",
      "[solidcore] is a national boutique fitness company with 100+ studios across the country.",
      "Our work sits at the intersection of AI, national security, and fighting crime.",
      "We're building for Mac, iOS, and web, and it's important that Granola feels like a good citizen on all.",
      "Lead end-to-end design for zero-to-one products, from early concept through national launch",
      "a global partner network with approximately 900 sports properties, including major national and international professional sports leagues",
    ]) {
      expect(detect(text), text).toHaveLength(0);
    }
  });

  it("keeps a real requirement that sits beside boilerplate in the same posting", () => {
    const mixed = [
      "We are an equal opportunity employer and consider all applicants without regard to race, religion, national origin, age or disability.",
      "Applicants must have, and maintain, the right to work in the United Kingdom from the first day of employment.",
    ].join(" ");
    const constraints = detect(mixed);
    expect(ofType(constraints, "right-to-work")[0].classification).toBe("HARD");
  });
});

describe("ambiguous jurisdiction language", () => {
  const nebius =
    "Applicants must be authorized to work in the country in which they apply and will be required to provide proof of employment eligibility as a condition of hire.";

  it("records the requirement but refuses to name a jurisdiction", () => {
    const [constraint] = ofType(detect(nebius), "work-authorization");
    expect(constraint.classification).toBe("AMBIGUOUS");
    expect(constraint.jurisdiction).toBeNull();
  });

  it("never excludes on an ambiguous requirement, even with complete facts", () => {
    expect(assessEligibility(detect(nebius), US_ONLY).verdict).toBe("REVIEW_REQUIRED");
  });

  it("never excludes on a supranational jurisdiction", () => {
    const bloc = "You must have the right to work in the European Union.";
    const assessment = assessEligibility(detect(bloc), US_ONLY);
    expect(assessment.verdict).toBe("REVIEW_REQUIRED");
    expect(assessment.blocking).toHaveLength(0);
  });
});

describe("missing candidate eligibility information", () => {
  const vanta = "Must be authorized to work in the U.S.";

  it("asks for review rather than guessing when nothing is declared", () => {
    const assessment = assessEligibility(detect(vanta), null);
    expect(assessment.verdict).toBe("REVIEW_REQUIRED");
    expect(assessment.blocking).toHaveLength(0);
    expect(assessment.candidateFactsUpdatedAt).toBeNull();
  });

  it("clears the same posting once the matching authorization is declared", () => {
    const assessment = assessEligibility(detect(vanta), US_ONLY);
    expect(assessment.verdict).toBe("ELIGIBLE");
  });

  it("rejects a declaration that names no recognisable country", () => {
    expect(buildCandidateFacts(["Mars", ""], true, new Date())).toBeNull();
    expect(parseCandidateFacts({ version: 1, authorizedCountries: [], declarationComplete: true })).toBeNull();
  });

  it("ignores completeness when the declared list is empty", () => {
    // "Complete and empty" would exclude every constrained role at once.
    expect(parseCandidateFacts({ version: 1, authorizedCountries: ["ZZ"], declarationComplete: true })).toBeNull();
  });

  it("does not accept an unversioned or foreign blob", () => {
    expect(parseCandidateFacts({ authorizedCountries: ["US"] })).toBeNull();
    expect(parseCandidateFacts("US")).toBeNull();
    expect(parseCandidateFacts(null)).toBeNull();
  });
});

describe("one requirement is reported once", () => {
  const ionqFull = [
    "Due to applicable export control laws and regulations, candidates must be a U.S. citizen or national, U.S. permanent resident, or lawfully admitted into the U.S.",
    "The position you are applying for will require access to technology that is subject to U.S. export control and government contract restrictions.",
  ].join(" ");

  it("does not report the same sentence as both a citizenship and an export-control bar", () => {
    const constraints = detect(ionqFull);
    expect(ofType(constraints, "citizenship")).toHaveLength(0);
    expect(ofType(constraints, "export-control")).toHaveLength(1);
  });

  it("drops the generic mention once the person requirement is stated", () => {
    expect(detect(ionqFull).map((item) => item.ruleId)).toEqual(["export-control.person"]);
  });
});

describe("verdict semantics", () => {
  it("surfaces a sponsorship refusal even when nothing bars the candidate", () => {
    const assessment = assessEligibility(detect("However, we are not able to sponsor visas."), null);
    expect(assessment.verdict).toBe("NO_CONSTRAINT_FOUND");
    expect(assessment.headline).toContain("does not offer visa sponsorship");
    expect(assessment.constraints).toHaveLength(1);
  });

  it("separates 'no constraint' from 'eligible'", () => {
    const none = assessEligibility(detect("A great design role with no eligibility language."), US_ONLY);
    expect(none.verdict).toBe("NO_CONSTRAINT_FOUND");
    const cleared = assessEligibility(detect("Must be authorized to work in the United States."), US_ONLY);
    expect(cleared.verdict).toBe("ELIGIBLE");
  });

  it("preserves every finding, including the ones it discounts", () => {
    const assessment = assessEligibility(
      detect(
        "We are an equal opportunity employer. Visa sponsorship is not available. Applicants must have the right to work in Germany.",
      ),
      US_ONLY,
    );
    expect(assessment.verdict).toBe("INELIGIBLE");
    expect(assessment.constraints.length).toBeGreaterThanOrEqual(2);
    expect(assessment.constraints.every((item) => item.evidence.length > 0)).toBe(true);
  });

  it("carries the detector version so stale assessments are identifiable", () => {
    expect(assessEligibility([], null).detectorVersion).toMatch(/^eligibility-detector@/);
  });
});
