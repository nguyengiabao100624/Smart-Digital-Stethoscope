# Smart Health - Remote-First Product Direction

Last updated: 2026-05-26

This file is the canonical product-direction handoff for new Smart Health chats. Read it before planning workspace, package, device, family profile, clinic/hospital portal, realtime scan, or permission work.

## Product Thesis

Smart Health is a remote-first health monitoring platform built around a connected digital stethoscope, realtime audio, durable scan records, AI support, sharing, and workspace management.

Smart Health does not compete with a traditional stethoscope when a doctor and patient are sitting in the same room. The core value is connected device deployment, realtime remote monitoring, stored clinical audio, AI-assisted review, profile sharing, and workspace administration.

The business is device + subscription packages + remote monitoring workflows. A package quota for devices means the number of machines activated or deployed in a workspace, not the number of patients that can ever use one machine.

## Core Workspace Model

`workspace` is the business, permission, billing, quota, and data-isolation unit. Existing code may still call this `organizationId`; new code should treat it as a legacy-compatible `workspaceId`.

Workspace types:

- `personal_family`: a person or family buys/uses devices and manages health profiles.
- `solo_practice`: an independent doctor manages a small remote-care workspace.
- `clinic` / `hospital`: a healthcare facility manages doctors, staff, patients, devices, storage, AI, reports, billing, and audits.

Core records:

- `user account`: a login identity in Firebase/backend. A person who can access app or web.
- `patient profile`: the health profile being measured. It does not always need its own login account.
- `device`: an activated stethoscope assigned to a workspace. One device can measure many patient profiles.
- `scan/session`: one realtime or recorded measurement. It must be tied to `workspaceId`, `deviceId`, `patientProfileId`, and `performedByUserId`.
- `share/access grant`: a permission to let a doctor, clinic, hospital, or family member view selected profiles or scans for a specific scope and time period.

## Family And Dependent Profiles

One family member can create the account and personal/family workspace. Other family members do not need separate app accounts just to be measured.

The account owner creates patient profiles such as self, spouse, parent, child, elder, or temporary dependent. Each profile should have its own `patientCode` or `profileCode`, relationship, demographics, notes, and optional consent/guardian metadata.

One device can be used for many profiles in the same family workspace. Before starting a scan, the app must ask which profile is being measured. Scan data is stored under that profile and must not be mixed with the account owner's profile unless the owner explicitly chooses that profile.

Sharing should work at three scopes:

- Whole family workspace, for a long-term family doctor relationship.
- One patient profile, for an individual care relationship.
- One scan or selected scans, for limited review.

Every share must have a scope, expiry, target doctor/facility, and audit trail.

## Real-World Workflows

Personal/family workflow:

1. A person creates an account and personal/family workspace.
2. They activate one or more devices under the workspace.
3. They create health profiles for family members or dependents.
4. They choose the correct profile before measuring.
5. They can stream realtime audio, save scans, view AI support, and share selected records with a doctor or facility.

Solo doctor workflow:

1. A doctor creates or is approved for a solo-practice workspace.
2. The doctor creates patients or family groups.
3. The doctor deploys, lends, or assigns devices for home monitoring.
4. Patients/families measure from home while the doctor can join or review remotely.
5. The doctor sees only profiles and scans in that solo workspace or explicitly shared to them.

Clinic/hospital workflow:

1. Smart Health platform admin creates or approves the clinic/hospital workspace and assigns a package.
2. The facility adds workspace admins, doctors, nurses/technicians, billing users, and viewers.
3. The facility activates and deploys devices to home patients, satellite sites, mobile teams, rural stations, or post-discharge programs.
4. Staff create patient profiles and family groups, assign doctors, and manage device access.
5. Doctors and authorized staff monitor realtime sessions, review historical scans, AI summaries, reports, storage, and audit logs.

## Clinic/Hospital Workspace Portal

Clinic/hospital management is web-first. The patient mobile app is not the organization administration surface.

The existing web admin should evolve into two role-aware modes before creating a separate app:

- Platform Admin Console: Smart Health internal operators manage all workspaces, packages, global devices, billing, high-risk actions, and global audit.
- Workspace Portal: each clinic/hospital sees and manages only its own workspace data.

Workspace Portal v1 must cover:

- Overview: active devices, patients/profiles, realtime sessions, AI usage, storage, quota.
- Staff: workspace admins, doctors, nurses/technicians, billing users, viewers.
- Patients and family groups: patient profiles, family/dependent profiles, access assignment.
- Devices: active/deployed devices, claim/pair status, heartbeat, revoke/transfer flow.
- Live monitoring: active and recent realtime sessions.
- Scans and AI: historical scan list, audio, AI result, doctor notes.
- Storage/reports: workspace-scoped files and exports.
- Settings: workspace profile, subscription/package readout, notification preferences.

## Role And Permission Direction

Roles should be enforced by backend memberships and capabilities, not by frontend-only checks.

Recommended roles:

- `platform_admin`: Smart Health internal system-wide administrator.
- `workspace_owner`: owner of a clinic/hospital/solo/personal workspace.
- `workspace_admin`: manages staff, patients, devices, reports, and settings inside one workspace.
- `doctor`: manages assigned patient profiles and scans.
- `nurse` / `technician`: supports device pairing, session setup, measurements, and operational notes.
- `billing`: views subscription, invoices, package usage, and quota.
- `viewer`: read-only reporting access.
- `patient` / `family_owner`: manages personal/family profiles and sharing.

`/api/me` should eventually return memberships, `currentWorkspaceId`, and capabilities. The frontend should render menus and actions from capabilities. The backend must still enforce every sensitive action.

Access control must cover patients, family profiles, devices, scans, storage files, exports, signed URLs, notifications, and audit logs.

## Package And Quota Semantics

`maxDevices` means activated/deployed devices in the workspace.

`maxPatients` means:

- Facility/solo workspace: patient profiles being followed.
- Personal/family workspace: family/dependent health profiles.

`maxDoctors` means doctors/staff seats for facility/solo workspaces. For personal/family packages, it should not be presented as "number of doctors"; sharing to doctors/facilities is a separate access-grant feature.

Storage, AI, and retention quotas apply to stored clinical audio, scan metadata, AI runs, and retention policy by workspace.

Quota enforcement must happen in backend APIs, not only in the UI.

## Technical Roadmap

1. Document this direction and keep it linked from new-chat context.
2. Keep JSON demo mode working while treating `organizationId` as legacy-compatible `workspaceId`.
3. Normalize backend membership, current workspace, and capability responses.
4. Make the existing web admin role-aware: Platform Admin Console and Workspace Portal.
5. Scope list/create/update/delete APIs by workspace.
6. Add family/dependent profile UX and profile selection before scan.
7. Add profile/scan sharing with scope, expiry, target, and audit.
8. Enforce package quotas for devices, patient profiles, staff seats, storage, AI usage, and retention.
9. Move runtime source of truth from JSON-compatible handlers toward PostgreSQL repositories.
10. Harden production device provisioning, authenticated realtime audio, HTTPS chunk upload, object storage, FCM, and audit.

## Acceptance Rules For Future Changes

- Do not describe a device quota as patient capacity.
- Do not require every family member to create an account just to be measured.
- Do not position the product as a simple in-room stethoscope replacement.
- Do not let clinic/hospital users manage organization data through the patient app.
- Do not rely on frontend filtering for tenant isolation.
- Preserve the existing demo audio path while production paths are built beside it.
