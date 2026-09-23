# Backend quality and integration implementation plan

Goal: finish participant 2's backend work with explainable AI-assisted scoring, grounded generation, deterministic demo data and verified integration.

Architecture: AI returns per-field quality decisions, never numerical scores. Shared deterministic scoring applies the existing 20/20/15/15/10/10/10 weights to accepted, human-confirmed fields. A review is tied to the exact content and industry, cached in the Task JSON payload, and invalidated on edits. Existing database tables and endpoint shapes remain compatible through optional fields.

Execution: user authorized implementation and autonomous routine decisions. Work in the existing feature checkout to preserve its uncommitted tunnel configuration and running application. No push or deployment is needed. Reuse the configured OpenAI and test Supabase credentials without exposing them. Independent workers own disjoint files; controller integrates and reviews.

## Global constraints
- Keep all existing public API routes and the catalogue's access to low-score tasks.
- Human confirmation remains mandatory; AI cannot publish, assign teams or fabricate information.
- Quality review uses fixed field names, complete unique decisions, Russian explanations, explicit fallback mode and exact input matching.
- No external calls on typing; explicit quality review and confirmation may call AI, with reuse of a current review.
- Preserve all pre-existing user changes. No real user records are deleted or overwritten by demo seeding.
- Live calls use only synthetic fixtures. Logs never include input text, output text or credentials.

## Tasks
- [x] 1. Shared quality schemas, deterministic safeguards and server confirmation/review integration. Test placeholders, malformed review, stale revision, score tampering and publication isolation.
- [x] 2. Separate Russian AI prompts, structured quality provider, safe diagnostic categories and extractive grounding. Test unrelated real evidence, invented numbers/contacts, malformed output, unavailable provider, retry limits.
- [x] 3. Idempotent synthetic seed and executable live/mock integration scripts. Use shared schemas and scoring; include 5 drafts, 5 publications, 5 teams, 5 proposals and all levels.
- [x] 4. Connect business editor to review and render reasons; add typed participant 3 gateway, update integration documentation. Business-builder is already an ancestor; participant 3 branch is absent on origin, so its missing UI cannot yet be merged.
- [x] 5. Run unit/type/build checks, live AI check, real database lifecycle/seed idempotency checks and browser verification. Independent final review and fixes.

## Interface decisions
- `src/lib/quality-contracts.ts`: QUALITY_FIELDS, qualityDecisionSchema, qualityReviewSchema, QualityReview.
- `src/lib/quality.ts`: qualityInputKey(content, industry), fallbackQualityReview(content, industry), calculateReviewedScore(content, review).
- `src/lib/server/quality.ts`: reviewQuality(content, industry, provider?) -> Promise<QualityReview>.
- ModelProvider accepts `questions | card | quality`; quality provider input is `{ content, industry }` and returns `{ fields: [{ field, accepted, reason, suggestion }] }` for each QUALITY_FIELDS entry.
- Task gains optional nullable `qualityReview`; POST /api/tasks/:id/review uses expectedRevision and returns Task. Confirmation reuses a matching review or obtains one server-side, then saves official score atomically.
- `qualityReview` contains source, version, inputKey, checkedAt and fields. Client-supplied review is never accepted by save/create.
- Seed tooling may import TS using a small local loader with node:module stripTypeScriptTypes; avoid adding dependencies.

## Review focus
- A stale review or a client-forged review cannot raise the official score.
- Model approval cannot award points to empty/obvious junk fields.
- Failure or slow AI preserves saving and returns labelled fallback.
- A genuine source quote paired with a fabricated field value must fail grounding.
- Running seeds twice leaves existing records and review state unchanged.

## Progress
Baseline: 51 tests passed, typecheck/build passed in previous assessment; current branch feat/backend-ai at 41e0acb. Existing changes: .env.example, docs/BACKEND.md, next.config.ts, src/lib/server/http.ts. Remote currently has business-builder and backend branches; participant 3 branch not yet available.

Verification: 93 tests pass; TypeScript and production build pass. Live questions/card/quality all returned source=ai; mock server returned source=fallback. Supabase seeding inserted 10 tasks and 5 proposals; second run inserted zero and preserved all existing rows. Smoke verified zero-score publication, review invalidation, concurrent revision protection, isolated public snapshot, multiple accepted teams and idempotent XP, then removed its temporary records. Browser production check: preliminary100 -> AI85 for unrealistic expectedResult -> published85 -> corrected field -> AI100; catalogue stayed85 until confirmation, then100 after reload.

Review: independent reviewer found numeric telephone/target over-filtering. Reproduced in a failing regression test, fixed with field-aware eligibility and approved on re-review. No remaining critical/important findings. Production verification initially inherited a different host OPENAI_API_KEY; restarting with the explicitly authorized project environment resolved it. No secret values were printed. The project's ignored .env.local now contains a generated demo access password for production; existing keys were preserved.
