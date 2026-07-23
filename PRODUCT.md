# Shcare Product

## Product identity

- Primary name: `Shcare`.
- Endorsed lockup: `Shcare — Smart Health Care`.
- Long-form description: `Shcare — Nền tảng Smart Health Care theo dõi tim phổi từ xa`.
- The product is a remote cardiopulmonary monitoring platform centered on a connected digital stethoscope, realtime audio, clinical scan records, AI-assisted review, workspace operations, and consent-aware data sharing.

AI supports analysis and review. It does not replace a qualified clinician or independently make a clinical decision.

## Users and surfaces

Shcare serves doctors, clinic and hospital operators, nurses, technicians, billing and administrative staff, patients, and family caregivers.

- Public Web explains the product, device, RPM workflow, security, pricing scope, and routes visitors into a truthful registration journey.
- Workspace Portal supports clinical and operational workflows on desktop and tablet.
- Platform Admin supports high-density platform operations, audit, device inventory, notification delivery, storage, and package management.
- Android supports native patient and clinician workflows, including profile switching, appointments, consent, pairing, guided scans, records, alerts, and notifications.
- Firmware `MSM261S4030H0` owns device identity, secure provisioning, audio capture, telemetry, commands, and OTA lifecycle.

Web/Admin and Android share business contracts and brand meaning, but they do not share layouts or component implementations. Android follows native mobile navigation, lifecycle, offline, permission, accessibility, and adaptive-layout conventions.

## Product trust contract

- Backend is the source of truth for identity, workspace membership, RBAC, lifecycle, ownership, audit, and mutation outcomes.
- A client must not show success before the correct authority confirms it: backend acceptance, device acknowledgement, or provider delivery.
- No production path may use fake KPI data, seeded clinical conclusions, sample AI conversations, fake QR scanning, timeline placeholders, or toast-only mutations.
- Every important surface covers loading, empty, partial, stale, error, offline, retry, permission-denied, 403, 404, and destructive states where applicable.
- Unsupported provider, runtime, emulator, device, or hardware proof is labeled `BLOCKED`; source or build proof cannot substitute for it.

## Brand personality

Clinical, precise, calm, humane, and technically credible. Shcare should feel like a dependable daily care tool, not a cyberpunk showcase or a generic SaaS template.

## Anti-references

Do not use neon or cyberpunk styling, decorative glassmorphism, gradient text, glow, ornamental orbs, repetitive card-template sections, unverified testimonials or metrics, or claims that AI can diagnose. Backend and provider names should not appear in ordinary user-facing copy.

## Product principles

- Task trust beats visual spectacle: every visible control works, truthfully explains why it is unavailable, or routes to the right next step.
- Clinical data stays readable in light, dark, and system themes.
- Equivalent workflows share API validation, lifecycle, error, permission, notification, and audit behavior across surfaces.
- Public pages earn distinction through information architecture, real product previews, credible copy, strong typography, and purposeful motion.
- Mobile workflows prioritize one-handed use, native back behavior, resilient lifecycle handling, and clear recovery.
- Destructive, clinical, security, device, and tenant-sensitive actions require explicit authorization, confirmation, and audit.

## Accessibility and inclusion

Web targets WCAG 2.2 AA, keyboard access, 44×44 minimum targets, zoom to 400%, visible focus, reduced motion, and semantic status text. Android targets 48dp minimum touch targets, TalkBack, font scale 200%, large display sizes, adaptive layouts, system animation settings, and non-visual alternatives for waveform data. Medical status must never rely on color alone.
