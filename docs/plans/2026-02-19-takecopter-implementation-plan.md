# takecopter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build V1 of takecopter with Desktop (Tauri+React) as the full creation workflow and Mobile (Flutter) as browse/light-edit workflow on a shared local-first project contract.

**Architecture:** Use a contract-first monorepo: `contracts/` defines project folder spec, SQLite schema, and DTO/state semantics; `apps/desktop` and `apps/mobile` implement platform-specific UX against the same contract. Desktop owns heavy authoring interactions (canvas/tree/rich text/media linking); Mobile focuses on read + light edit.

**Tech Stack:** Tauri, React, TypeScript, Vite, Tailwind, Zustand, TanStack Query, React Flow, Tiptap, dnd-kit, Flutter, Riverpod, go_router, Drift(SQLite), Turborepo, pnpm.

---

### Task 1: Monorepo Bootstrap

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `package.json`
- Create: `apps/desktop/` (skeleton)
- Create: `apps/mobile/` (Flutter scaffold placeholder + README)
- Create: `contracts/README.md`

**Step 1: Initialize workspace files**

Write minimal `pnpm-workspace.yaml` and `turbo.json` for app and contract packages.

**Step 2: Add root scripts**

Add `dev`, `build`, `lint`, `test`, `typecheck` scripts to root `package.json`.

**Step 3: Validate workspace wiring**

Run: `pnpm -w install`
Expected: install succeeds with no missing workspace warnings.

**Step 4: Commit**

```bash
git add pnpm-workspace.yaml turbo.json package.json apps contracts
git commit -m "chore: bootstrap monorepo for desktop mobile contracts"
```

### Task 2: Shared Project Contract (Folder + JSON Schema)

**Files:**
- Create: `contracts/project-structure/project-layout.md`
- Create: `contracts/project-structure/project.schema.json`
- Create: `contracts/project-structure/versioning.md`
- Test: `contracts/project-structure/project.schema.test.ts`

**Step 1: Define project folder contract**

Document `<story>.takecopter/` structure (`project.json`, `story.db`, `assets/*`, `.lock`).

**Step 2: Define `project.json` schema**

Include required fields: `project_id`, `title`, `schema_version`, `created_at`, `updated_at`.

**Step 3: Write contract tests**

Test valid and invalid sample project metadata against schema.

**Step 4: Verify tests**

Run: `pnpm test --filter contracts`
Expected: schema tests pass.

**Step 5: Commit**

```bash
git add contracts/project-structure
git commit -m "feat: define takecopter project folder and metadata contract"
```

### Task 3: SQLite Core Schema + Migrations

**Files:**
- Create: `contracts/schema/sql/001_init.sql`
- Create: `contracts/schema/sql/002_indexes.sql`
- Create: `contracts/schema/sql/003_fts.sql`
- Create: `contracts/schema/migrations.md`
- Test: `contracts/schema/schema-smoke.test.ts`

**Step 1: Write core tables**

Add tables for `stories`, `setting_cards`, `setting_relations`, `episodes`, `scenes`, `shots`, `takes`, `asset_files`, `node_setting_refs`.

**Step 2: Add index strategy**

Create indexes for relation traversal, hierarchy ordering, and reference reverse lookup.

**Step 3: Add FTS support (desktop target)**

Create FTS virtual tables/triggers for setting + scene/shot text.

**Step 4: Validate migration apply**

Run: `pnpm test --filter contracts`
Expected: migrations apply to empty DB and pass smoke checks.

**Step 5: Commit**

```bash
git add contracts/schema
git commit -m "feat: add core sqlite schema with indexes and fts"
```

### Task 4: Desktop App Shell + Save State Semantics

**Files:**
- Create: `apps/desktop/src/app/routes.tsx`
- Create: `apps/desktop/src/state/save-status.store.ts`
- Create: `apps/desktop/src/layout/AppFrame.tsx`
- Create: `apps/desktop/src/ui/SaveIndicator.tsx`
- Test: `apps/desktop/src/state/save-status.store.test.ts`

**Step 1: Build app shell routes**

Create Home / Setting / Create route skeletons.

**Step 2: Implement global save status state**

Support only `Saved | Saving | Error` transitions and expose selectors.

**Step 3: Bind status indicator to shell**

Render persistent top-right save state in app frame.

**Step 4: Verify transitions by test**

Run: `pnpm test --filter desktop`
Expected: state transition tests pass.

**Step 5: Commit**

```bash
git add apps/desktop/src
git commit -m "feat(desktop): add app shell and global save status"
```

### Task 5: Desktop Data Layer + Tauri File Commands

**Files:**
- Create: `apps/desktop/src-tauri/src/commands/project.rs`
- Create: `apps/desktop/src-tauri/src/commands/assets.rs`
- Create: `apps/desktop/src/data/repositories/*.ts`
- Create: `apps/desktop/src/data/transaction.ts`
- Test: `apps/desktop/src/data/repositories/*.test.ts`

**Step 1: Implement project open/create commands**

Create/read project folder, validate schema version, return typed DTO.

**Step 2: Implement asset import command**

Copy source file to `assets/`, store relative path, return metadata/hash.

**Step 3: Add lock file handling**

Acquire/release `.lock` for write sessions and expose lock conflict errors.

**Step 4: Add repository methods**

Map usecases to SQL transactions (create card, link relation, reorder nodes, select take).

**Step 5: Verify data integration tests**

Run: `pnpm test --filter desktop`
Expected: repository tests pass including lock/error paths.

**Step 6: Commit**

```bash
git add apps/desktop/src-tauri apps/desktop/src/data
git commit -m "feat(desktop): implement filesystem commands and sqlite repositories"
```

### Task 6: Desktop Feature Delivery (Home / Setting / Create)

**Files:**
- Create/Modify: `apps/desktop/src/features/home/*`
- Create/Modify: `apps/desktop/src/features/setting/*`
- Create/Modify: `apps/desktop/src/features/create/*`
- Test: `apps/desktop/src/features/**/*.test.tsx`

**Step 1: Home feature**

Implement story list/search/create/open + quick entry.

**Step 2: Setting feature**

Integrate card list + canvas (React Flow) + relation edit + detail panel + autosave debounce (600ms).

**Step 3: Create feature**

Implement EP/Scene/Shot/Take tree, reorder, selected_take, and @reference picker.

**Step 4: Run feature tests**

Run: `pnpm test --filter desktop`
Expected: feature tests pass for key flows.

**Step 5: Commit**

```bash
git add apps/desktop/src/features
git commit -m "feat(desktop): deliver home setting and create workflows"
```

### Task 7: Mobile V1 (Flutter Read + Light Edit)

**Files:**
- Create: `apps/mobile/lib/app/router.dart`
- Create: `apps/mobile/lib/features/story/*`
- Create: `apps/mobile/lib/features/setting/*`
- Create: `apps/mobile/lib/features/create/*`
- Create: `apps/mobile/lib/data/drift/*`
- Test: `apps/mobile/test/features/*_test.dart`

**Step 1: Initialize Flutter app structure**

Set up go_router + Riverpod + Drift and base app shell.

**Step 2: Implement browse flows**

Story list/detail, setting card detail, hierarchy tree browsing.

**Step 3: Implement light edit flows**

Allow title/summary/short text/tag updates with save-state feedback.

**Step 4: Enforce V1 scope limits**

Hide/disable complex canvas editing and bulk reorder actions.

**Step 5: Verify mobile tests**

Run: `cd apps/mobile && flutter test`
Expected: widget and repository tests pass.

**Step 6: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): ship v1 browse and light edit workflows"
```

### Task 8: Migration, Recovery, and Validation

**Files:**
- Create: `apps/desktop/src/features/migration/*`
- Create: `contracts/schema/fixtures/*`
- Create: `docs/testing/migration-checklist.md`
- Test: `apps/desktop/src/features/migration/*.test.ts`

**Step 1: Build migration checker**

On project open: version check -> lightweight asset scan -> route to relink wizard if needed.

**Step 2: Build relink wizard**

Match by hash/filename, allow manual replace, write resolved path back to DB.

**Step 3: Add end-to-end migration tests**

Cover moved project folder, missing assets, and recovery path success.

**Step 4: Verify**

Run: `pnpm test --filter desktop`
Expected: migration and relink tests pass.

**Step 5: Commit**

```bash
git add apps/desktop/src/features/migration contracts/schema/fixtures docs/testing
git commit -m "feat: add project migration checks and asset relink flow"
```

### Task 9: Quality Gates + Release Readiness

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `docs/release/v1-readiness-checklist.md`
- Modify: root scripts/config for CI

**Step 1: Set CI gates**

Run typecheck, lint, tests for contracts and desktop; run Flutter tests for mobile.

**Step 2: Add readiness checklist**

Map acceptance criteria from product prototype to testable checks.

**Step 3: Dry-run release build**

Run: `pnpm build` and `cd apps/mobile && flutter build apk --debug`
Expected: both builds succeed.

**Step 4: Commit**

```bash
git add .github docs/release package.json turbo.json
git commit -m "chore: add ci gates and v1 readiness checklist"
```

### Task 10: Documentation and Handoff

**Files:**
- Create: `README.md`
- Create: `docs/architecture/overview.md`
- Create: `docs/architecture/contract-reference.md`
- Create: `docs/operations/project-migration-runbook.md`

**Step 1: Write getting-started docs**

Document local setup for desktop + mobile + contracts.

**Step 2: Write architecture and runbook docs**

Include lock behavior, save-state semantics, migration/relink procedures.

**Step 3: Final verification**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: all pass, no blockers.

**Step 4: Commit**

```bash
git add README.md docs
git commit -m "docs: add architecture setup and migration runbook"
```

---

## Execution Notes
- Development mode: strict incremental delivery (task-by-task, test-first where practical).
- Commit policy: one logical unit per commit, avoid mixed-scope commits.
- Scope control: Mobile V1 remains read/light-edit only.
- Future extension: React Native can be added by reusing `contracts/` and implementing a new app adapter.
