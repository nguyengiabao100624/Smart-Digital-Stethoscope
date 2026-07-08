# KLTN Workspace Instructions

- Workspace root: `D:\Study\KLTN`.
- Shell: PowerShell.
- Global tool/skill registry: `C:\Users\baobe\.codex\GLOBAL_AGENT_TOOLING.md`.
- Global instructions: `C:\Users\baobe\.codex\AGENTS.md`.
- Smart Health project rules: `C:\Users\baobe\.codex\skills\smart-health-project\SKILL.md`.
- Start Smart Health work by reading the canonical handoff files under `D:\Study\KLTN\docs` listed by `smart-health-project`.
- For broad Smart Health requests such as "complete everything", "synchronize the whole system", "audit all functions", or cross-repo parity work, use a skill bundle rather than one skill: `smart-health-project` + `context-budget` + `strategic-compact`, then add the relevant implementation, UI/UX, QA, security/auth/data, deploy, and handoff skills for every touched surface.
- For auth/account/session/tenant/data-isolation changes, include a security review/validation pass and fresh verification evidence. Do not claim completion from navigation-only or read-only checks.
- For every UI/UX task, begin with `impeccable` and `gpt-taste`, then consult the global registry's UI/UX Skill Pool and load every additional global/plugin skill that materially improves visual design, frontend implementation, accessibility, responsive behavior, motion, platform conventions, performance, Figma/image-to-code work, or UI QA. Do not restrict execution to only two skills or to a one-specialized-Taste cap; skip only UI/UX skills that are unrelated to the current surface.
- Do not create repo-local `.agents\skills`, `.ai_skills`, copied plugin payloads, or `skills-lock.json`; install shared capabilities globally according to the registry.
- Keep repo-local instructions limited to project-specific facts. Global tool catalogs and routing rules belong in the registry.
