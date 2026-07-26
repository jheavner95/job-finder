# Workspace instructions

## Local-only architecture

This is a private, single-user application intended to run locally on the
user's Mac mini. Preserve Next.js, Prisma, and SQLite. Do not introduce a public
deployment target or external authentication unless the user explicitly
reverses this instruction.

## “Push it” completion rule

When the user says **“push it”**, treat the request as one end-to-end release:

1. Commit the intended workspace changes.
2. Push the resulting commit to the configured remote as a source-code backup.
3. Confirm that the push succeeded and the working tree is in the expected state.

Do not deploy this application. The SQLite database, local context files,
backups, environment files, and other private runtime data must not be committed
or pushed.

## Desktop-only product constraint

This application is intentionally designed for desktop use only.

- Optimize product design and visual verification for a 1440px-wide viewport,
  with comfortable use from approximately 1280px upward.
- Preserve the fixed desktop sidebar, focused central content width, scannable
  opportunity previews, and side-by-side secondary panels.
- Continue to support keyboard navigation and usable 200% browser zoom.
- Do not design, implement, test, or report mobile layouts, tablet layouts,
  touch-first interactions, mobile navigation, 390px behavior, or
  mobile-specific breakpoints.
- Behavior below the intended width may degrade gracefully. Reflow required
  solely for 200% desktop zoom is an accessibility behavior, not a mobile
  product surface.
