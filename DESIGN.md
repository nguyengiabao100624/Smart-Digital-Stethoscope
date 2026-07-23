# Shcare Design System

## Surface architecture

Shcare has one coherent brand and four purpose-built interface systems:

- Public Web: marketing and product education for responsive browsers.
- Workspace Portal: clinical and operational work on desktop and tablet.
- Platform Admin: dense data, filters, audit, and keyboard-oriented operations.
- Android: native compact and adaptive mobile workflows.

Web and Admin consume the React-free `@shcare/brand` tokens. Android uses its own `ShcareMobileTheme` and Compose components. Android must not pixel-match Web or reuse its component, spacing, elevation, navigation, or motion implementation.

Web/Admin theme mode is `light|dark|system`. First use follows the operating
system, explicit preference persists, cross-tab changes synchronize, and the
initial render must not flash the wrong theme. Toasts, charts, dialogs, logos,
and print views must render from the same resolved theme.

## Brand assets

The source logo is an SVG mark built from two rounded biological-signal strokes forming an `S`. Required variants are symbol, horizontal lockup, monochrome, light, dark, favicon, and 1200×630 Open Graph artwork. Avoid generic heart, cross, or stethoscope marks.

## Web and Admin colors

- Ink: `#0B1F33`
- Primary text: `#102A43`
- Muted text: `#52677A`
- Primary cobalt: `#2457D6`
- Vital teal: `#087F75`
- Light canvas: `#F4F8FB`
- Light surface: `#FFFFFF`
- Border: `#D8E3EA`
- Dark canvas: `#071722`
- Dark surface: `#0D2533`
- Success: `#18794E`
- Warning: `#A15C00`
- Danger: `#B4233A`
- Info: `#2563A6`

Android may reuse semantic brand intent and selected brand colors, but its light/dark surface hierarchy, tonal elevation, shapes, and state layers are defined independently for mobile legibility.

## Typography

- Public brand and headings: Manrope 600/700.
- Auth, Portal, Admin, and data: Source Sans 3 400/500/600/700.
- Web fonts are self-hosted WOFF2 subsets with Vietnamese coverage and `font-display: swap`.
- Android uses a mobile-specific type scale and line height. It may use the brand font, but it must follow Android readability, font scaling, and platform semantics rather than copying Web sizes.

Avoid decorative display fonts, all-caps body copy, overly wide text measures, and oversized headings that fragment into short lines.

## Web and Admin foundations

Web keeps one canonical primitive tree under `src/components/ui`; Admin uses adapters backed by the same brand tokens. Standard components include Button, IconButton, Field, Input, Select, Combobox, DatePicker, Card, PageHeader, FilterBar, DataTable, StatusBadge, Skeleton, Empty/Error/Permission State, Dialog, Drawer, Toast, and destructive confirmation.

Cards and panels use restrained borders, surface contrast, and modest shadows. Do not add neon, gradient text, glassmorphism, glow, decorative orbs, or a new global override layer. Every interactive component covers hover where relevant, focus-visible, pressed, disabled, loading, validation, error, and permission states.

## Android foundations

Android uses Compose-native `ShcareScaffold`, app bars, bottom navigation, navigation rail, mobile fields, pickers, search, filter/status chips, vital/device/appointment/record cards, state surfaces, bottom sheets, snackbars, confirmation dialogs, timelines, waveform, audio controls, progress, and sync state.

Spacing follows a mobile 4/8dp system. Touch targets are at least 48dp. Layouts adapt at 360/412/600/840dp, use navigation rail and two-pane detail when appropriate, respect system bars and IME, and do not stretch a phone canvas to tablet width.

## Layout principles

- Public Web uses strong page hierarchy, credible product imagery, fewer purposeful sections, and visible primary/secondary CTAs.
- Portal uses a task-first sidebar/drawer, workspace identity, role-aware navigation, responsive data surfaces, and predictable page headers.
- Admin prioritizes scanability, dense but legible tables, filter persistence, detail drawers, command search, and mutation review.
- Android prioritizes one-handed reach, native back navigation, contextual detail, keyboard-safe primary actions, offline recovery, and role-specific compact navigation.

## Motion

- Public Web: purposeful reveal and transition motion at 300–500ms, with a maximum four-item stagger.
- Portal/Admin: microinteractions at 150–220ms; drawers and dialogs at no more than 240ms.
- Android: context-aware native transitions at 180–260ms and haptics only for important confirmation, warning, or successful device connection.

Animate only opacity and transform where possible. Do not hijack scrolling, run decorative loops, or apply the same choreography to every route. Web respects `prefers-reduced-motion`; Android respects system animator scale and Remove animations.

## Accessibility and data visualization

Web targets WCAG 2.2 AA, 44×44 targets, 4.5:1 text contrast, skip links, explicit labels and errors, visible focus, and zoom to 400%. Android targets 48dp, TalkBack semantics, state descriptions, font scale 200%, display scaling, orientation changes, edge-to-edge insets, and non-visual waveform summaries.

Charts and KPI surfaces state the claim first, keep essential values available without hover, use direct labels, expose stale/empty/offline states, and never communicate a medical or operational state by color alone.

## Performance budgets

- Web CSS: no more than 70KB gzip.
- Total Web fonts: no more than 220KB.
- Public initial JavaScript: no more than 250KB gzip.
- Public targets: LCP ≤2.5s, INP ≤200ms, CLS ≤0.1.

These are release targets, not claims. A build or bundle report must provide evidence before they are marked achieved.
