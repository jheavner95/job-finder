# Matching policy

Last updated: 2026-07-24

## Purpose

Define how Job Finder turns verified candidate context and normalized job information into an explainable score and confidence level. This policy does not authorize applications or employer communication.

## Hard requirements, preferences, and positive signals

- **Hard requirement:** a user-confirmed rule whose clear violation makes a role ineligible. Hard requirements are evaluated separately from weighted scoring.
- **Preference:** a user-confirmed condition that improves or reduces ranking but does not determine eligibility alone.
- **Positive signal:** job evidence that aligns with known strengths or desired work characteristics.

Profile defaults are not hard requirements. A hard exclusion requires explicit confirmation from the candidate and unambiguous contradictory job evidence.

## Missing information and confidence

Missing candidate or job information is not negative evidence. The affected category is marked `missing`, receives no positive or negative contribution, and reduces confidence. Optional unknowns, including compensation, cannot reject a role by themselves.

## Contradictory job information

When a posting contains contradictory statements:

1. Preserve both statements.
2. Mark the category low-confidence.
3. Use the more conservative interpretation only as a concern, not an invented fact.
4. Explain the contradiction and request verification.

Clear negative evidence may reduce a category score. Ambiguity may reduce confidence but must not masquerade as a penalty.

## Title equivalence

Senior, Staff, Lead, Principal, Product Design Lead, Senior UX Designer, Senior UX/Product Designer, and Founding Product Designer are potentially relevant. Title is a search signal. Actual responsibility, autonomy, strategic scope, hands-on expectations, and organizational level determine fit.

## Transferable industry experience

Industry fit considers transferable problem characteristics such as regulation, enterprise complexity, operational workflows, platforms, internal tools, legacy modernization, and developer-facing systems. Exact-industry experience is positive evidence when confirmed, but adjacent complexity can also support a score. Industry labels alone cannot determine fit.

## Portfolio evidence

Portfolio support is strongest when a confirmed project record maps the candidate’s responsibilities and artifact evidence to a job requirement. High-level strength statements provide lower-confidence support. Missing project proof reduces confidence rather than creating negative evidence.

## Penalties versus missing evidence

- **Penalty:** explicit negative evidence, such as a clearly incompatible requirement or confirmed concern.
- **Missing evidence:** information not supplied or not verified.
- **Not applicable:** a category that legitimately does not apply to the role.

Only explicit negative evidence creates a penalty. Missing and not-applicable categories make zero contribution.

## Score and confidence

The match score summarizes known positive and negative evidence. Confidence summarizes how much weighted evidence is known and applicable. A high score with low confidence means the known evidence is promising but incomplete. A lower score with high confidence means the mismatch is well supported.

Every category records its evidence state, reason, contribution, and available evidence. Every overall result exposes both score and confidence.

## User decisions

Automated evaluations remain separate from `UserDecision` records. A user status change never rewrites the automated score or reasoning.

A rejected recommendation may become a learning signal for similar future roles, but it does not become an absolute exclusion. The reason for rejection must be captured, compared with existing preferences, and confirmed before changing a hard rule.

## Explainability requirement

Every score must remain explainable so the candidate can:

- see which evidence raised or lowered it,
- distinguish missing context from a real mismatch,
- identify contradictions,
- correct inaccurate assumptions,
- understand confidence,
- and make an independent decision.

Opaque or untraceable scoring is not acceptable.
