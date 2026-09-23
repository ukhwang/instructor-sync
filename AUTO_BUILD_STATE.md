# Current Phase
UI-6 COMPLETE
# Completed
* P0-1 through P0-10 — PASS
* UI-1 Figma tokens and navigation — PASS
* UI-2 session note visual integration — PASS
* UI-3 homework creation visual integration — PASS
* UI-4 public member and submission visual integration — PASS
* UI-5 dashboard and care queue visual integration — PASS
* UI-6 member detail visual integration — PASS
# Current Baseline
TypeScript: PASS
Verify: PASS
Build: PASS
# Modified In Latest Phase
* app/globals.css
* components/TrainerNav.tsx
* app/app/session/[memberId]/page.tsx
* app/app/homework/new/page.tsx
* app/h/[token]/MemberHomeworkClient.tsx
* app/app/page.tsx
* app/app/members/[id]/page.tsx
# Next
Production Release Gate: apply approved migrations and run deployed smoke test.

# Production Release Audit — 2026-09-19
Status: BLOCKED (supersedes the earlier production-readiness implication; UI completion remains unchanged).

## Verified locally
* Existing project: C:\Users\tmd31\instructor-sync, branch main. All ten requested core files exist.
* Existing modified, deleted, and untracked work preserved. No application code or migration changed in this audit.
* `npx tsc --noEmit`: PASS.
* `npm run verify`: PASS, 77 passed / 43 skipped / 0 failed; one existing unused-variable lint warning. Initial sandbox EPERM was resolved by running outside the sandbox.
* `npm run build`: PASS outside the sandbox. Local environment has demo mode enabled; this is not evidence of production authentication or production environment configuration.
* Seven regression tests added to tests/feedback-db.test.mjs for the numeric public RPC: missing/null/expired/revoked tokens, token-scoped mutation, immutable resubmission, response fields, and anon table privileges.
* Both requested migrations reviewed together. Numeric submission uses an empty search_path, row locking, token expiry/revocation validation, levels 1–10, a unique immutable submission, atomic snapshot/log writes, and revocation of legacy mutation RPC access. Specific anon EXECUTE is intentional. Existing tests verify snapshot/hash and write-failure rollback. PGlite concurrency tests are not independent production-session concurrency evidence.

## Release blockers
* Configured Supabase hostname returned DNS_ERROR_RCODE_NAME_ERROR. Remote migration history, function definitions, grants/RLS, pgcrypto schema placement, and auth configuration could not be verified. No remote migration applied; no project or secrets changed.
* No .vercel/project.json, Vercel CLI authentication at checked standard locations, available deployment connector, or existing browser session. Existing Vercel project/Production URL and authenticated deployment access are required; no duplicate project created.
* Explicit targeted legacy checks fail: `node --test --test-name-pattern='LEGACY-OWN-parent|LEGACY-ATOMIC' contracts/legacy-p0.mjs`. A trainer can attach homework to another trainer's member in the local legacy schema, and failed item creation leaves a homework body. These are existing issues, outside the two feedback migrations; default verify does not execute this contract file. Current feedback migrations do not repair either issue.
* Production smoke tests, actual account isolation, mobile 390px/Kakao flow, and migration recovery rehearsal remain unverified. An authorized synthetic trainer account is needed.

## Resume
Confirm the existing Supabase target and Vercel project/access, resolve parent ownership and atomic homework creation with additive changes, validate migration prerequisites/recovery and deployed schema, then deploy to the existing project with demo mode disabled and complete production smoke tests. Do not infer permission to replace a Supabase project or rotate secrets.

# Production Release Update — 2026-09-20
Status: CONDITIONALLY READY. The authenticated trainer and physical mobile/Kakao smoke tests remain required.

## Applied and verified
* Linked Supabase project: `qqlztmckqvyhbbnqwoft` (Sydney / `ap-southeast-2`, active and healthy). The remote target had no application tables or functions before release.
* Applied all six reviewed additive migrations through Supabase CLI. Remote migration history now matches local through `20260920000000`.
* Added `20260920000000_trainer_ownership_and_atomic_homework.sql`: parent-member ownership checks for homework/session notes, update `WITH CHECK` enforcement, one atomic authenticated homework creation RPC, unique homework item ordering, and empty `SECURITY DEFINER` search paths for public token read and homework creation.
* Remote verification: all required tables have RLS; anon has no direct homework/log/submission table privileges; only `open_homework` and final feedback RPC have anon execute; `create_homework` is authenticated-only; all three verified definer functions use `search_path=""`.
* Vercel: existing `instructor-sync` project deployed successfully to https://instructor-sync-three.vercel.app. Production uses the new Supabase public URL/key, demo mode is disabled, and app functions are in `syd1`, aligned with the Supabase region.
* Local release gates: `npm run verify` 81 passed / 43 skipped / 0 failed (one pre-existing lint warning); `npm run build` passed.
* Anonymous production smoke: landing 200, login 200, unauthenticated `/app` 307, nonexistent public token safely rendered its not-found state, and the public final-feedback RPC returned `not_found` for a synthetic nonexistent token.

## Required before READY
* Create/sign in with a dedicated synthetic trainer account on Production and verify the authenticated trainer flow end-to-end.
* Complete the 390px physical phone and Kakao in-app-browser public-link smoke test.
* Confirm email signup/callback behavior if a fresh trainer account is used; configure Supabase Auth site/redirect URLs only if that real test exposes a redirect failure.

# Member Onboarding Release — 2026-09-20
Status: OPERATIONALLY APPLIED. Authenticated Production and physical mobile/Kakao checks remain manual gates.

## Implemented
* Split `+ 회원 등록` into new and existing-member flows. New registration accepts one package count and derives remaining count server-side. Existing registration accepts total and current remaining counts.
* Existing-member registration can atomically preserve an optional source, original text, summary, and original date range. Imported material remains separate from session notes and completion/care metrics.
* Added idempotent authenticated RPCs for member registration/import and later record addition. Duplicate request IDs replay the same result and reject changed payloads.
* Added trainer-scoped import records with RLS, no anon table privileges, authenticated read-only Data API access, and empty-search-path SECURITY DEFINER functions.
* Added member count constraints as NOT VALID checks so new/updated rows are protected without rewriting or deleting legacy data. Production precheck found zero existing violations.
* Removed anon execution from `revoke_homework` and removed Data API execution from the unused `toggle_pro_status`; the public homework read/submission RPC boundary remains unchanged.
* Member detail shows all imported records and allows later additions. Session note context shows the latest imported summary or original record without treating it as an actual session.

## Verification and deployment
* `npx tsc --noEmit`: PASS.
* `npm run verify`: PASS, 89 passed / 43 skipped / 0 failed; one pre-existing unused-variable warning.
* `npm run build`: PASS locally and on Vercel.
* Supabase migration history matches local through `20260920115204`. The migration was the only pending remote change and applied successfully.
* Anonymous Production RPC probes: member registration/import, homework revocation, and Pro toggle denied; invalid public homework lookup returned `not_found`.
* Existing Vercel project deployed Ready and aliased to `https://instructor-sync-three.vercel.app`; dynamic functions run in `syd1`, aligned with Supabase `ap-southeast-2`.
* Anonymous Production smoke: landing 200, login 200, unauthenticated `/app` 307, invalid public token safely rendered. Warm checks were about 0.1–0.6 seconds; the first public-link request was about 1.9 seconds.

## Remaining gates
* Use a dedicated synthetic trainer session to register one new and one existing member, verify imported-record display in member/session screens, create homework, submit through the public link, and verify immutable resubmission plus dashboard/care-queue reflection.
* Verify the same public-link flow at a physical 390px viewport and in Kakao in-app browser.
* Confirm fresh signup email callback reaches Production rather than localhost. The browser available to this audit had no authenticated app session, so no credentials or real customer data were requested or used.

# Authenticated Production Smoke — 2026-09-21
Status: CORE FLOW VERIFIED. Physical 390px/Kakao and fresh signup callback remain manual checks.

## Verified with a dedicated logged-in trainer session
* New member `QA 신규회원 0920` created with 8 registrations and displayed as 8 total / 8 remaining.
* Existing member `QA 기존회원 0921` created with 20 total / 3 remaining and optional imported source text + summary. The record is shown separately from session notes and in the next-session context.
* Four-step session note saved for the synthetic member and its exercise prefilled the homework form.
* Homework link generated and opened publicly without member login. Why text, exercise, sets/reps, and coaching cue rendered.
* Synthetic member submitted 완료, discomfort 4/10, and a memo. The confirmation screen states that the link cannot be edited; reloading the same token kept the immutable submitted state.
* Trainer dashboard reflected 100% open rate, 100% response rate, one session alert, and the submitted activity.
* Care queue and renewal card reflected the synthetic member at 3 remaining sessions; the next-session opening script included the member response.
* A production-only error display improvement now preserves Supabase error messages instead of replacing them with a generic failure. The updated build is deployed to the existing Vercel project.

## Final gates
* `npx tsc --noEmit`: PASS.
* `npm run verify`: PASS, 89 passed / 43 skipped / 0 failed; one pre-existing unused-variable warning.
* `npm run build`: PASS locally and on Vercel.
* Production deployment: Ready and aliased to `https://instructor-sync-three.vercel.app`.
* Remaining manual checks: physical 390px viewport, Kakao in-app browser, and a fresh signup email callback. No real member data was used in this smoke test.

# Member Progress G0-G2 — 2026-09-21
Status: COMPLETE (measurement contract only; G3 database implementation not started)

## G0 baseline and reliability
* Confirmed the current public submission RPC writes completion and discomfort as separate logs in one transaction. The public confirmation UI previously selected the last log, which is the discomfort row, and could show `숙제 미완료` after reload even when the member completed the homework. The UI now selects the latest `complete`/`cant` row and preserves the member memo.
* Existing imported-record date fields are controlled `YYYY-MM-DD` inputs and the RPC/database types are `DATE`. The earlier automated smoke result showing `날짜 미상` was not reproducible from the source alone; it remains a manual browser input-event check, not a basis for changing the migration.
* Existing discomfort 1–10 remains explicitly labeled as current discomfort. It is not treated as posture correction, pain diagnosis, or a zero value when missing.

## G1 25-member boundary
* Current code still gates non-Pro member creation at 5 in the member screen. The authenticated RPC does not establish a 25-member entitlement, and no pricing or operating permission was changed.
* A 25-member pilot therefore remains a product/entitlement decision for G3/G9. No 25 synthetic members were created and no plan was auto-promoted.

## G2 measurement contract
* Finalized [`docs/MEMBER_PROGRESS_DATA_CONTRACT.md`](docs/MEMBER_PROGRESS_DATA_CONTRACT.md): 1–3 functional goals, fixed condition/metric/unit/version, baseline and reassessment observations, missing-value reasons, member-reported versus trainer-measured source, separate better/same/worse/unknown opinion, date rules, and aggregation rules.
* Added the pure validator [`contracts/member-progress-contract.mjs`](contracts/member-progress-contract.mjs) and boundary tests [`tests/member-progress-contract.test.mjs`](tests/member-progress-contract.test.mjs). This is a contract test only; it does not write production data.

## Verification
* `node --test tests/member-progress-contract.test.mjs tests/feedback-client.test.mjs`: PASS.
* Full TypeScript, verify, and build gates remain the release baseline; rerun after any G3 schema/app change.

## Next start point: G3
Design an additive Supabase migration and authenticated/owned RPCs for goal definitions, observations, and member change opinion using the G2 contract. First add ownership, version, date, unit, and idempotency tests; do not alter existing homework feedback tables or infer medical outcomes. No production migration was applied for G0-G2.

## G0-G2 Production update
* The minimal public confirmation fix was deployed to the existing Vercel project and aliased to `https://instructor-sync-three.vercel.app`.
* Production HTTP smoke after deployment: landing 200, login 200, unauthenticated `/app` 307 to `/login`, and the known public link 200. The rendered submitted state contains `기록 완료` and no longer falls back to `숙제 미완료`.

# Member Progress G3 — 2026-09-21
Status: IMPLEMENTED AND OPERATING (schema/RPC applied; UI remains G4)

## Implemented
* Added additive migration `20260921000000_member_progress_measurements.sql` for trainer-owned goals, observations, member change opinions, and request idempotency.
* Goal + baseline observation + optional opinion are one RPC transaction. Reassessment and append-only correction are one RPC transaction. Same request/payload replays the stored response; changed payload returns `request_conflict`.
* Database checks enforce metric/unit pairing, difficulty 0–10, non-negative values, future-date rejection in Asia/Seoul, explicit missing-value reasons, correction reasons, and one active-goal limit at the RPC boundary.
* New tables have RLS enabled, no direct PUBLIC/anon/authenticated table grants, and only three authenticated SECURITY DEFINER RPCs with an empty search path.
* Added typed browser data access in `lib/member-progress-types.ts` and `lib/member-progress-data.ts`. These functions do not fall back to demo data on RPC failure.

## Verification and operation
* `node --test tests/member-progress-db.test.mjs`: PASS (ownership, atomic baseline, replay/conflict, invalid values, anon denial).
* `npx tsc --noEmit`: PASS.
* `npm run verify`: PASS, 97 passed / 43 skipped / 0 failed; one pre-existing unused-variable warning.
* `npm run build`: PASS.
* Supabase dry-run listed only `20260921000000_member_progress_measurements.sql`; linked migration history now matches through `20260921000000`.
* Remote read-only verification: all four new tables have RLS; each G3 RPC has `anon_execute=false`, `authenticated_execute=true`, and `search_path=""`.

## Next start point: G4
Add an optional member-detail `일상 목표와 변화` section using the typed RPC module. Implement first goal + baseline, reassessment, correction, and reload/error states in a separate component. Keep registration, session notes, homework creation, public links, and the 390px flow unchanged. Do not add graph aggregation until G4 persistence and ownership smoke tests pass.

# Member Progress G4 — 2026-09-21
Status: IMPLEMENTED AND DEPLOYED (member detail input/report baseline)

* Added `components/member-progress/MemberProgressPanel.tsx` to the member detail page.
* The panel supports optional goal + baseline input, reassessment input, member opinion, reload-safe observation table, and baseline-to-recent change text.
* Existing registration, imported records, session notes, homework, and public member flow remain separate.
* Production deployment is Ready and aliased to `https://instructor-sync-three.vercel.app`.
* Basic Production smoke after deployment: landing 200, login 200, unauthenticated `/app` 307, public link 200.

## Next start point: G5/G6
Add period filtering and a richer accessible report only after a logged-in synthetic member creates two observations. Then add version-aware trainer confirmation and next-action notes. Export/recovery and physical 390px/Kakao checks remain separate operational gates.

# Usability and Exercise Catalog Update — 2026-09-21
Status: IMPLEMENTED AND DEPLOYED (content/search foundation)

* Progress input now distinguishes blank from explicit zero, measured from unmeasured, and member report from trainer measurement. Unmeasured entries require a reason; correction keeps the original and links a new record.
* Session/member/homework labels use `수업 준비`, `회원 목표`, `숙제 응답`, and `상담 준비` language. Renewal output is a single editable natural paragraph without `된 것/아직/다음` labels.
* Added shared `ExercisePicker` and catalog interface backed by the current seed list. Homework and session flows can search and select through the same component.
* Added purpose buttons and generated homework guidance. The draft remains editable and direct edits are preserved.
* Applied additive `20260921010000_exercise_catalog.sql`; unreviewed rows remain `draft`, so no unreviewed exercise content was published.
* `npx tsc --noEmit`: PASS; `npm run verify`: PASS (97 passed / 43 skipped / 0 failed); `npm run build`: PASS.
* Production deployment aliased to `https://instructor-sync-three.vercel.app`; HTTP smoke: landing 200, login 200, `/app` 307, public link 200.

## Final usability deployment check — 2026-09-21
* Final Vercel deployment completed and was aliased to the existing Production URL.
* Public landing 200; public login 200; protected `/app` and `/app/renewals` redirect 307 to login; public homework link 200.
* Landing response no longer contains the old `된 것` 상담 labels.

## Remaining validation
* Authenticated browser validation of the generated Why draft, search selection, source/zero/unmeasured progress input, and correction flow remains required.
* Exercise catalog needs reviewed content before rows can move to `published`.
* Period report filtering, trainer confirmation/next-action history, CSV export/recovery, and physical 390px/Kakao checks remain open.

# Release continuation — 2026-09-21

* Existing dirty worktree preserved. No project replacement, reset, destructive migration, auth replacement, pricing, or Pro policy change.
* Added additive correctness migration `20260921074826_member_progress_correctness.sql` and additive exercise snapshot migration `20260921075052_exercise_catalog_snapshots.sql`. Existing applied migrations were not edited.
* Supabase dry-run before apply listed exactly those two migrations. Apply succeeded; post-apply dry-run reported `upToDate: true`.
* Member progress now preserves blank/zero/unmeasured semantics, source versus authenticated trainer actor, Asia/Seoul measurement dates, append-only corrections, stable request IDs across response-loss retries, and form state on retryable errors.
* Exercise picker now uses a provider boundary, DB published content plus legacy seed fallback, alias/tag/equipment search, goal-aware Why drafting, manual Why protection, and canonical exercise snapshots for new homework. Unreviewed DB exercise content remains unpublished.
* Production wording changed from `SESSION ALERT`/context phrasing to `수업 준비 메모`/`회원 기록 요약`; landing copy no longer promises improved health or increased renewal rate.
* Final gates after the last copy change: `npx tsc --noEmit` PASS; `npm run verify` 123 passed / 43 skipped / 0 failed; `npm run build` PASS. One pre-existing ESLint warning remains in `infra/postgres/schema-integrity.test.mjs`; Next.js middleware deprecation warning remains at build.
* Existing Vercel project `instructor-sync` redeployed and aliased to `https://instructor-sync-three.vercel.app`.
* In-app browser smoke: landing, authenticated app, session preparation, homework creation, exercise picker opening, public homework link, and synthetic member progress baseline/reassessment/correction/reload rendered. Unauthenticated `/app` 307 remains backed by the earlier post-deploy HTTP smoke; physical 390px/Kakao and public final submission rerun remain manual.

## Next start point

G5: implement period-filtered, accessible member change report and pure aggregation tests for zero/one/two observations, missing values, correction lineage, source/condition changes, and date boundaries. Keep G6 confirmation/next-action history and G7 export/recovery separate.
# Homework v2 Luna execution — 2026-09-22

Status: local implementation and verification complete; additive migrations applied and existing Vercel Production deployed; authenticated member click-through remains manual.

Completed: v2 member item selection and complete/partial/cant submission adapter, requirement projection migration, manual set start/countdown flow, partial result display/opening line, and same-homework reissue draft flow. Existing worktree preserved.

Quality: TypeScript PASS; verify PASS (170 passed / 43 skipped / 0 failed); build PASS. Supabase migrations `20260921171403`, `20260921173014`, and `20260922100000` are applied to the linked project. Vercel Production is Ready at the existing alias. HTTP smoke passed for landing/login/protected redirect/public link; authenticated item submission and physical/Kakao checks remain unverified.

Next start: run the authenticated synthetic-member click-through for complete/partial/cant, retry/immutability, set start/countdown, detail display, and reissue; then perform 390px/Kakao checks.

# Homework v2 Production P0 correction — 2026-09-22

Status: Production P0 fixed, redeployed, and browser-verified.

Fixed the live member submission gate so checked exercises can submit complete/partial results. Added reload-safe idempotent draft handling without storing the public token, disabled demo bypass in production, and stopped core read failures from appearing as empty data or invalid public links. No schema or migration change was required.

Final gates: TypeScript PASS; verify PASS (180 passed / 43 skipped / 0 failed); build PASS. Existing Vercel project redeployed as `dpl_5uvTfmNi6xnFEKwxTWRwqRyHJiqe` and aliased to `https://instructor-sync-three.vercel.app`.

Production browser smoke: authenticated 390px homework creation PASS; synthetic complete PASS; partial PASS with one of two required items, discomfort 6/10 and memo; cant PASS; immutable reload PASS; trainer detail, dashboard, and care queue reflection PASS. Three QA homework rows were intentionally created for `QA 기존회원 0921`. Kakao in-app browser and the voice/visual set timer were not manually rerun in this deployment and remain manual checks.

# Exercise content review drafts — 2026-09-22

Status: local draft data and local PGlite review store created; no Supabase changes or publication.

* Preserved the supplied Perplexity response and extracted JSON in `data/exercise-catalog/`. Normalized three draft variants: bodyweight squat, standard floor push-up, and forearm plank.
* All human review fields, prescription amounts, and media remain null. Mixed variants and questionable universal criteria are recorded for review, not published.
* `scripts/exercise-draft-db.mjs` validates by default and writes only to the fixed local `.local/review-db` with `--write-local`. First import inserted 3; replay inserted 0. Remote targets/publication are unsupported.
* New tests cover invalid draft publication/review/dose/source inputs, idempotency, batch conflict rollback, revision preservation, and restricted direct access. Full verify: 186 passed / 43 skipped / 0 failed, TypeScript and ESLint passed with one existing warning.
* Review entry point: `docs/EXERCISE_DRAFT_REVIEW.md`. Next: review specific variant/cues/source support/pause guidance, increment content_version for edits, then separately implement reviewed catalog integration. No deployment or production content insertion performed.

# Pitch P1 and exercise DB continuation — 2026-09-22

Status: conditional pitch readiness; existing worktree preserved; latest code deployed to the existing Vercel Production alias.

* Stage 0 fixed same-page retry identity when sessionStorage is unavailable, blocked synchronous duplicate submissions, allowed `못 했어요` to be changed back to item selection, and filtered restored item IDs to the current homework.
* Stage 1 recorded the current npm audit: production scope has 1 critical, 18 high, 13 moderate, and 9 low findings. No force fix or broad dependency update was run; `next@16.2.2` remains a P1 release caution.
* Stage 2/3 local regression passed for session notes, homework assignment, structured timer states, pause/resume, manual next set, and audio failure fallback.
* Stage 4 now prefers saved exercise snapshot media/alt/default cue on the member page and uses name fallback only for legacy items. Existing catalog/snapshot/permission tests passed. No new exercise content was published; 12 candidates are documented as draft review work.
* Final gate: `npx tsc --noEmit` PASS; `npm run verify` PASS (182 passed / 43 skipped / 0 failed); `npm run build` PASS. Existing Vercel deployment `dpl_FVDYwx6ZuKny441RUU3kRZ1xkC9J` is READY and aliased to `https://instructor-sync-three.vercel.app`.
* Production HTTP smoke: landing 200, login 200, unauthenticated `/app` 307 to `/login`, known public link 200. Authenticated click-through, physical 390px/Kakao WebView, dependency patch, and content review remain unverified.
* Execution evidence is in `docs/PITCH_P1_EXECUTION_LOG.md`, dependency evidence in `docs/PITCH_DEPENDENCY_AUDIT.md`, and readiness in `docs/PITCH_READINESS_REPORT.md`.

## Next start point

Run the authenticated synthetic-member click-through, then record the remaining physical 390px/Kakao/content-review results separately. Do not mark those manual checks PASS without evidence.
