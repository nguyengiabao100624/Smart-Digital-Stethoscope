# Smart Health - Rules And Skills Audit

Last updated: 2026-07-10

Source prompt: `C:\Users\baobe\.codex\attachments\6b4ffe4f-b430-4c9c-abe6-f4b19e85dfa4\pasted-text.txt`

This audit upgrades the existing global/project rules. It does not replace the old rules from scratch. The canonical global registry remains `C:\Users\baobe\.codex\GLOBAL_AGENT_TOOLING.md`; this file records what changed and how future Smart Health work should use the installed skills/tools.

## A. Upgraded Global Rules

- Start every non-trivial task by mapping the user's intent to the smallest effective installed skill/tool bundle. The user does not need to name the skill.
- Read the relevant global and repo instructions before broad exploration: global `AGENTS.md`, repo `AGENTS.md`, project skill if present, then targeted handoff docs.
- Use `context-budget` as a lightweight scope gate before reading large folders, and use full `context-budget` only for broad, long, audit, install, or context-pressure work.
- Use `strategic-compact` as a phase-boundary decision gate, not as a default interruption.
- For structural source questions, use CodeGraph first; for broad semantic architecture or persistent ADRs, use Codebase Memory; for literal text, use `rg`; for current third-party docs, use Context7/`find-docs`.
- For UI/interface work, load `impeccable` + `gpt-taste`, then every UI/UX skill that materially applies to the current surface. Product tokens, platform conventions, accessibility, and task requirements override generic marketing or motion rules.
- For broad product-completeness work, do not stop at one skill. Combine domain, implementation, UI/UX, QA, security/auth/data, deployment, documentation, and handoff skills according to touched surfaces.
- After edits, verify in proportion to risk: lint/typecheck/build/test/smoke/browser/emulator/hardware/provider checks where available.
- Do not claim full completion unless the relevant source, adjacent flows, permissions, validation, tests/smokes, and blockers have been checked.
- Keep skills/tooling global unless the user explicitly asks for a project-pinned local copy.

## B. Upgraded Smart Health Project Rules

- Smart Health is the full `D:\Study\KLTN` healthcare product system, not a normal single web app.
- Treat backend API, Shcare Web, Web Admin, Android, Firebase, Render, Supabase/Postgres/storage, firmware/device, smoke tooling, and handoff docs as one connected product.
- Start broad Smart Health work with `smart-health-project` + `context-budget` + `strategic-compact`, then add surface-specific lifecycle skills.
- For product changes, trace the end-to-end workflow: backend repository/policy, auth/role/tenant isolation, web/admin/Android clients, firmware/device flow when relevant, provider/live data, smoke coverage, deploy impact, and docs.
- For UI/UX changes, check desktop/tablet/mobile, light/dark mode, typography, spacing, contrast, overflow, console/network errors, and existing design tokens.
- For role/account/profile/settings/password/session/notification changes, check all affected roles and surfaces, not only the screen being edited.
- For IoT/device changes, include provision/claim/assign/revoke, heartbeat/events, battery/status/logs, reconnect, OTA, audio path, and sensor-data privacy.
- For auth/data-isolation changes, include security validation and denial-path smoke evidence.
- Update Smart Health handoff docs after meaningful code/config/tooling changes.

## C. Skill Usage Rules Based On Installed Inventory

Current verified inventory:

- `.agents\skills`: 198 folders.
- `.agents\.skill-lock.json`: tracks 195 folders from 9 official GitHub sources.
- `.codex\skills`: 60 Codex/system/project skills.
- Plugin cache: 126 `SKILL.md` files.
- Full metadata audit: 384 `SKILL.md`, zero missing `name`/`description`, 25 duplicate names mostly from plugin cache current/remote copies.
- Repo-local Smart Health skills: none.

| Capability | Use when | Do not use when | Combine with | Expected result |
| --- | --- | --- | --- | --- |
| `smart-health-project` | Any Smart Health code/config/docs/product work | Non-Smart-Health tasks | `context-budget`, `strategic-compact`, task skills | Project-specific rules and handoff are applied first. |
| `context-budget` | Scope/audit/install/long tasks, avoiding broad scans | One-line self-contained answers | Project skill, CodeGraph, handoff docs | Smaller authoritative read set and clear stop condition. |
| `strategic-compact` | Long phase changes, large tool output, handoff decision | Mid-edit when local context is needed | `handoff`, context docs | Compact only at useful boundaries. |
| Matt flow: `ask-matt`, `wayfinder`, `to-spec`, `to-tickets`, `implement` | Shaping broad requests into specs/tickets/vertical slices | Direct small code fixes with clear scope | Domain skill, TDD, review, GitHub tools | Better planning without forcing user to name exact skill. |
| Matt quality: `tdd`, `code-review`, `diagnosing-bugs`, `codebase-design`, `domain-modeling`, `improve-codebase-architecture` | Test-first work, review, hard bug diagnosis, module design | Cosmetic-only tasks or when local repo patterns are enough | CodeGraph, test runner, security review | Behavior-backed fixes and clearer module boundaries. |
| UI/UX: `impeccable`, `gpt-taste`, Taste/UI pool | Interface design, redesign, polish, accessibility, responsive, visual QA | Backend-only tasks | Build Web Apps, browser/Chrome, image/Figma skills as needed | UI changes respect product tokens and are visually/UX verified. |
| Build Web Apps / React / shadcn | Web implementation, React/Tailwind/shadcn patterns, frontend QA | Non-web surfaces | UI/UX skills, browser smoke, Context7 for docs | Framework-consistent web changes. |
| Android/iOS QA/build skills | Native app UI/build/runtime checks | Backend-only work | Gradle/Xcode tools, emulator/device tools | Native proof instead of source-only claims. |
| Codex Security | Auth/session/tenant/data/security-sensitive work | Pure copy or low-risk UI styling | Domain skill, backend smokes, threat model/validation | Permission, data isolation, and denial paths are checked. |
| Supabase/Postgres skills | DB schema, migration, RLS, production data inspection | JSON-only demo logic | Backend repositories, migrations, smoke tests | Data changes are schema-backed and policy-aware. |
| Context7/`find-docs` | Current library/API/SDK/CLI/cloud docs | Business logic debugging or refactoring without external API question | Official docs, code inspection | Answers use current docs, not stale memory. |
| `agent-reach`, `research-lookup`, `exa-search`, `parallel-web` | Web/GitHub/YouTube/RSS/current research | Local repo facts already available | Citation/report skills when needed | External facts are verified through web-capable tools. |
| `academic-research-suite` | Thesis/research writing, literature review, citation quality | Product code implementation | Citation/paper/scientific writing skills | Research output follows thesis-quality workflow. |
| Documents/PDF/PPT/XLSX runtime skills | Office file creation/editing/reading | Plain Markdown/code tasks | Legacy `docx`/`pptx`/`xlsx` only for specialized cases | File artifacts are handled with the right document tools. |
| gstack workflows | QA, review, ship, deploy, browser reports, guard/freeze workflows | Small edits where direct commands are cheaper | Browser, build/test scripts, handoff docs | Structured workflow only when its overhead pays off. |
| GitHub/plugin tools | Issues, PRs, CI/deploy, comments | Local-only edits without remote action | Review, security, deploy skills | Remote workflow is handled with actual GitHub context. |

Legacy note: `decision-mapping`, `to-prd`, and `to-issues` are still visible on disk but are not in the latest `mattpocock/skills` CLI discovery set. Prefer `wayfinder`, `to-spec`, and `to-tickets`.

## D. Flexible Skill Usage Rule

Do not bind a whole category of work to one fixed skill forever. If the same class of task fails repeatedly or the user says the outcome is still wrong, re-evaluate the skill bundle, widen the relevant capability set, and change strategy. For complex tasks, select skills by subtask: exploration, architecture, implementation, UI/UX, security/data, QA, deploy, docs, and handoff.

## E. Completion Checklist

Before saying a task is complete:

- Confirm the request and affected scope.
- Confirm the actual installed skill/tool bundle used.
- Read real source/config/docs relevant to the claim.
- Check adjacent flows, roles, permissions, validation, and data/storage paths where relevant.
- Run available verification commands proportional to risk.
- For UI, check responsive behavior, light/dark mode, contrast, overflow, and real browser/emulator behavior when possible.
- For backend/API/data, check validation, error handling, auth/tenant isolation, migration/schema, and denial paths.
- For IoT/hardware, distinguish source/build proof from physical device proof.
- Report what passed, what failed, what was not checked, and why.

## F. Anti-Fake-Completion Rules

Do not say "done", "fully complete", "reviewed everything", "100% fixed", or "no remaining issues" unless the whole relevant scope was verified. If any provider, credential, hardware, device, network, mailbox, or production env is unavailable, report it as a blocker or unverified area. If only source/build smoke passed, say source/build smoke passed, not live/provider/hardware completion.

## G. Rules Kept

- Global storage policy: keep skills/MCP/plugins global and repo docs as pointers.
- Every-task routing/token gate.
- Smart Health starts from project index and handoff docs.
- CodeGraph for structural code questions.
- Context7 for current library docs.
- Impeccable + Taste base pair for UI.
- Smart Health handoff maintenance after meaningful changes.

These were kept because they reduce repeated scanning, prevent stale setup drift, and directly address prior false-completion risk.

## H. Rules Supplemented Or Modified

- Expanded update policy to cover official GitHub source refresh for skills missing from `.skill-lock.json`.
- Added source inventory for `pbakaus/impeccable`, `leonxlnx/taste-skill`, `Panniantong/Agent-Reach`, `affaan-m/ECC`, `upstash/context7`, and `Imbad0202/academic-research-skills-codex`.
- Clarified Matt legacy routing: old `to-prd`/`to-issues`/`decision-mapping` are fallback only.
- Strengthened Smart Health role/surface/IoT/provider verification wording.
- Added persistent tooling refresh commands to `SMART_HEALTH_COMMANDS_GUIDE.md`.

## I. Rules Removed Or Merged

- Removed the stale idea that only a filtered subset of Matt skills is current.
- Merged scattered UI/UX skill wording into the global UI/UX pool rule.
- Replaced vague "use skills if needed" guidance with explicit routing tables and source-refresh commands.
- Kept duplicate skill names only when documented with routing precedence; did not hand-delete plugin cache duplicates.

## J. Gaps Found In Old Rules

- Several useful user-wide skills existed without lock source, so `skills update -g` did not reliably update them.
- Matt routing was incomplete and missed current `setup-matt-pocock-skills`, `wayfinder`, `to-spec`, and `to-tickets`.
- Some docs still said "filtered Matt skills" or implied old project-local skill storage.
- Duplicate handling was under-specified for plugin cache and user/system name collisions.
- Completion rules did not explicitly force strategy changes after repeated unsatisfactory attempts.

## K. Useful Installed Skills Previously Underused

- `setup-matt-pocock-skills`, `wayfinder`, `to-spec`, `to-tickets`.
- `context-budget`, `strategic-compact` as gates rather than general-purpose coding skills.
- `agent-reach` for web/GitHub/YouTube/RSS research.
- `academic-research-suite` for thesis/research flows.
- `find-docs`/Context7 for current technical docs.
- `impeccable` plus the broader Taste/UI pool beyond only `gpt-taste`.
- `codebase-design`, `domain-modeling`, `improve-codebase-architecture` for architecture work.
- Codex Security and Supabase/Postgres plugin skills for auth/data-risk tasks.

## L. How The New Rules Force Skill Use

- `GLOBAL_AGENT_TOOLING.md` now lists the official sources and explicit reinstall/update commands.
- `SMART_HEALTH_AGENT_SKILLS_GUIDE.md` now routes broad Smart Health work to a bundle, not one skill.
- `SMART_HEALTH_COMMANDS_GUIDE.md` now includes repeatable skill refresh commands.
- Completion rules require naming real verification and blockers, which makes skipped QA/security/provider checks visible.
- Legacy skills are marked fallback so current replacements are selected first.

## M. How The New Rules Force Strategy Changes

- If a repeated task fails or user feedback says the result is still wrong, the assistant must reassess the skill/tool bundle.
- The next attempt must widen or change the approach: use structural tools, current docs, security validation, UI QA, provider checks, or domain-specific skills as appropriate.
- The assistant must report what changed in strategy instead of repeating the same narrow skill set.
- For Smart Health, broad prompts must route through the project index and prompt handoff ledger to avoid repeating already-closed slices.
