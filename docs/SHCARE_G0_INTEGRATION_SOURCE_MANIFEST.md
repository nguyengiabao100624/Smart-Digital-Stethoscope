# Shcare G0 integration source manifest

Captured: `2026-08-23` (`Asia/Saigon`)
Plan: [Kế hoạch tích hợp Phase 0–7, bổ sung UI còn thiếu và phát hành Shcare](SHCARE_LEGACY_UI_FULL_FUNCTION_RELEASE_PLAN.md)
Worktree: `C:\Users\baobe\Documents\Codex\2026-07-13\lam\work\shcare-rc2-impl-8e2`
Branch: `release/shcare-v1.0.0-rc.2-local-demo`
G0 entry HEAD: `1c902b29405717c28d8dfa908e4eeb16137971cc`
Retained functional proof revision: `c1933d979db69ae8bc105489d1accdec9bfd0fe5`

## Locked inputs

- Phase 0–7 logic/API/contract/test evidence is retained and must not be rebuilt without a reproduced regression.
- Integration base is the current HEAD plus the preserved dirty files below.
- Visual sources are the currently deployed Web and Admin sites plus the existing source/component vocabulary.
- `.gstack/**`, dependencies, build outputs, caches and every secret/ignored config are excluded.
- No reset, stash-all, force-push, wholesale checkout or `git add -A` is authorized.

## Live baseline fingerprints

| URL | HTTP | HTML bytes | HTML SHA-256 | ETag |
|---|---:|---:|---|---|
| `https://shcare.web.app/` | 200 | 2,532 | `0b85d44d87dc36ae5702bd9435dd38ba2f1b56cf681659de767c6c1e1b18614d` | `02fbfaa9546e7309c430f2014fa3fd53bb30df8e06fe746340ff78cacf5b98be` |
| `https://shcare.web.app/dang-nhap` | 200 | 2,532 | `0b85d44d87dc36ae5702bd9435dd38ba2f1b56cf681659de767c6c1e1b18614d` | same Web shell |
| `https://shcare.web.app/quen-mat-khau` | 200 | 2,532 | `0b85d44d87dc36ae5702bd9435dd38ba2f1b56cf681659de767c6c1e1b18614d` | same Web shell |
| `https://shcare-admin.web.app/` | 200 | 7,737 | `88db8d0473c54cefd1f5b7d869123c184b85e022aa6697a8772d4d377e9a3b3d` | `fcd8bfd91b76253bf1cf9a578be3a158dba3ab80d030c8260b0aabba2700ee9f` |

Chrome screenshots are under `docs/evidence/g0-live-baseline/`. Animation and transitions were disabled, carets hidden and video frames masked; no authenticated production account or PHI was used.

| Screenshot | Viewport/theme | Bytes | SHA-256 |
|---|---|---:|---|
| `web-home-desktop-light.png` | 1440×1000 light | 2,299,026 | `e3a86aa91eb0ea686462edefb1539ccecd4dd0a1a42534a04e42bba86fbe7598` |
| `web-home-mobile-light.png` | 390×844 light | 1,553,089 | `edbe3dfad723fc3371fa80c41eaa9eed7de8d8b10cb6c53de2ac3e122fd715e6` |
| `web-forgot-desktop-light.png` | 1440×1000 light | 740,031 | `5489b06f1e9991c00aed2ad4071f0d82d45843e8009966d1973154c48259fb42` |
| `web-forgot-mobile-dark.png` | 390×844 dark | 114,690 | `f687317d2f9478ca5e1817ba657b6dfb09052bad211204a2e21a665cc38399b6` |
| `admin-root-desktop-light.png` | 1440×1000 light | 28,935 | `8265e67a96174cdf7c7a278bd0de74cea1b19cd06d1192a01d52f3dce2fcd510` |
| `admin-root-mobile-dark.png` | 390×844 dark | 23,629 | `ff45347fb20a3052083a54cd781b3e13f8ef03858a600c28c96e3863fb8ec016` |
| `web-home-desktop-light-settled.png` | 1440×1000 light | 2,394,752 | `ea82c3f90e8bee0ad17a9ef089262acc55390b538c570faaa75f3fbbf0f5ca99` |
| `web-home-mobile-light-settled.png` | 390×844 light | 1,586,079 | `2beb89a736bd4e3e6fa48b9c59a317b484eb970ca500f0a72fa7f09df2398044` |

## Preserved dirty set at G0 entry

Combined digest of sorted `status|path|bytes|sha256` records:
`d68fc486a354ed0fc0df75a061eece45f75870e98c517a63117d065d45b97776`

| Status | Path | Bytes | SHA-256 |
|---|---|---:|---|
| `??` | `docs/SHCARE_LEGACY_UI_FULL_FUNCTION_RELEASE_PLAN.md` | 7,017 | `79B48FE581AC1A4191B631E2713FB1611B3464CC547F85778E50A4940D9D5B2F` |
| `M` | `smart-health-admin/thiết kế giao diện/src/components/admin/ForgotPassword.tsx` | 5,938 | `8C8C59D0B54E8D50EFA70BBE1A9F2F28BD5FF19E85E9C623C5281A77CEFFB968` |
| `M` | `smart-health-admin/thiết kế giao diện/src/components/admin/Layout.tsx` | 47,106 | `6D790C2907105B760D79EF0A6B0B497D12DB38FCA5099A94BBEE8CA9CD0FFDBF` |
| `M` | `smart-health-admin/thiết kế giao diện/src/components/admin/Login.tsx` | 7,340 | `AEBEF8C24002F42A52266E37FB2631E2E3ED00816FCAF8BD346A16F73444D7D9` |
| `M` | `smart-health-admin/thiết kế giao diện/src/components/admin/ShcareBrand.tsx` | 1,545 | `8A964C1DAE4562EEFF60DDB74658B8288C2C7FF61EE002C21C261A970350B4BC` |
| `M` | `smart-health-admin/thiết kế giao diện/src/styles.css` | 8,061 | `ECF2D1D69D5FF6EF4B233D08D797DD363D708F21CFEA7AB826C54CFF1585B8CC` |
| `M` | `smart-health-web/scripts/authBrowserSmokeTest.mjs` | 14,812 | `2FC54448A27AFCC7CCD21C28B15E4777E963FD60649CC0E95A1656BDABB150E5` |
| `M` | `smart-health-web/scripts/portalUiFoundationBrowserSmokeTest.mjs` | 83,761 | `15D353812A3B40FF1C90DB99ECB7643779673E07A6089F511148B248E3E2D129` |
| `M` | `smart-health-web/scripts/publicUiFoundationBrowserSmokeTest.mjs` | 15,943 | `1C3DCB7073700C34722D1F7D3F5AA5F2FD2C9483C30ECE9A801E53C771E9BB80` |
| `M` | `smart-health-web/src/app/App.tsx` | 1,481 | `FD060392DE6F0249E4A916F08A577C2E9C51E4DDDB81FF1B941080C5A211E745` |
| `M` | `smart-health-web/src/app/components/auth/AuthPrimitives.tsx` | 7,803 | `13961A985FB7EC5FBC454F0265A55B432D97145BD1B75B64EE6865FE413BB45F` |
| `M` | `smart-health-web/src/app/layouts/AuthLayout.tsx` | 5,686 | `459464C764431B1752F8846074488AD11538AFDB230C3ADD1EAABB6642CF84BA` |
| `M` | `smart-health-web/src/app/layouts/PortalLayout.tsx` | 17,817 | `8043FC34BEAE809A5E3F6C620EC257EAE4FECBD4284465713AF26BD1E5B4217D` |
| `M` | `smart-health-web/src/app/layouts/PublicLayout.tsx` | 21,450 | `E9ECA24EE2EAFF538B673EEDB1B2F352BB8C977CE6CB1939845A1E13A53DD510` |
| `M` | `smart-health-web/src/app/pages/auth/ForgotPasswordPage.tsx` | 4,094 | `6D42DFE3B3792B75807FFEECB7A6B1E582EC0B7B6C5AC7EA4C2A5DCC7A01FF9B` |
| `M` | `smart-health-web/src/app/pages/auth/LoginPage.tsx` | 9,956 | `A1707D50AF5E46CFAE88C3E56E38574031D5A6E87ACAAB5AB26506855E7C3DBA` |
| `M` | `smart-health-web/src/app/pages/auth/RegisterClinicPage.tsx` | 34,608 | `5E8A5416B3B5D4CF142D27ACD08A152FF87BF8381B26F53E4445B7CE7EA3CF55` |
| `M` | `smart-health-web/src/app/pages/auth/RegisterDoctorPage.tsx` | 36,952 | `D851FB5283220080F514070988A2E1132064D1D45E5B33AFB915A8543B6CDDCB` |
| `M` | `smart-health-web/src/app/pages/portal/DashboardPage.tsx` | 19,476 | `C913E635AC07651E1F49424F9264224F16EA9F4BF2F100AD8B47CA526AF61E66` |
| `M` | `smart-health-web/src/app/pages/public/HomePage.tsx` | 17,346 | `ACF30A124FAD1256CBFFCA1DF2844BBC2678E9AE500205DB0F726A634205AE80` |
| `M` | `smart-health-web/src/styles.css` | 353 | `0AF593EAB5AB75EE9C1D61968D0B462CA93343AFAF33BF0E01DC735961B7400B` |
| `M` | `smart-health-web/src/web-styles/clinical-polish.css` | 142,477 | `350A55D23944A2970FAA43AE188B1C262D4F8B54D27745EE87C5164A9797C7E5` |
| `M` | `smart-health-web/src/web-styles/signal-horizon.css` | 121,265 | `16755BA824491F55B5490636B8124AAB06381864798B5EBDA3F0B6AEE2146BFC` |
| `M` | `smart-health-web/src/web-styles/theme.css` | 92,035 | `AAA6E0E45C965DE06FBC930BFCD428A977B77BA4B6C5B8D8671A6E63CD403C4A` |
| `M` | `smart-health-web/test/auth/dashboard-page.test.tsx` | 7,473 | `26ABE167CF4F4394EE2AA7A2C3EA1C094B78B2EA3D67CBF3EFDC6FEAB2103990` |
| `M` | `smart-health-web/test/auth/registration-pages.test.tsx` | 2,930 | `922E698CC3DD05A2AF5F523BB8A88A415CB300CDA4ECC58A5DF681CA0892C81B` |
| `M` | `smart-health-web/test/contracts/active-css-graph.test.ts` | 11,059 | `B97590B93AC838A3F21046EB67C14D0E622547E54B12C78D1CCCD9D50155FBB4` |
| `M` | `smart-health-web/test/contracts/auth-ui-foundation.test.ts` | 4,340 | `35B6781C38B954E7C729267D9BB90F6BB54EFA654A066038A6F8B97DA7738A41` |
| `??` | `smart-health-web/test/contracts/portal-live-visual-compatibility.test.ts` | 2,517 | `0B7C32DF6588D68D62540B44DCF4C261072CEDD4A55A522673009642B8FE22FB` |
| `??` | `smart-health-web/test/contracts/public-nav-auth-compatibility.test.ts` | 3,139 | `D6B060E4A81F8496132228435423D57B8CB02C471EDE747A07D0B807A056B042` |
| `M` | `smart-health-web/test/contracts/public-ui-foundation.test.ts` | 5,953 | `19B78945DF3B619C5DEDF1FA7E88A317EBA5E7E9F03FB20C6F066F83F29A9DD4` |
| `M` | `smart-health-web/test/contracts/theme-contract.test.ts` | 2,465 | `F3C49C276F41FE588D853422347FAA8432ACAF168DC972CE66C6E64DE06B6E18` |

## G0 classification rule

Each affected route/function must be assigned exactly one state before G1:

- `ĐÃ_CÓ_UI`: preserve behavior and current visual vocabulary; fix only proven quality defects.
- `CHƯA_CÓ_UI`: add the required entry point, screen/control and complete states without redesigning the product.
- `MIXED_CẦN_GHÉP`: retain Phase 0–7 logic/tests and reconcile only the presentation layer.
- `REGRESSION`: fix the reproduced broken seam and add a boundary test.
- `NGHIỆP_VỤ_THẬT_SỰ_CÒN_THIẾU`: implement only after the public contract/workflow gap is demonstrated.

This manifest records the starting point. Later G-phase edits are tracked by checkpoint and intentional diff; they do not rewrite this entry snapshot.

## G0 inventory verdict

| Surface | Classification | Locked conclusion |
|---|---|---|
| Web shell | `ĐÃ_CÓ_UI` | Preserve shell contracts and current routing |
| Public, 22 routes | `MIXED_CẦN_GHÉP` + `REGRESSION` | Preserve routes/content; reconcile presentation, semantic nav and motion |
| Auth, 15 routes | `MIXED_CẦN_GHÉP` | API/validation remain real; retain mobile scroll and contrast fixes |
| Portal, 28 routes | `MIXED_CẦN_GHÉP` + `REGRESSION` | Preserve capability/workspace logic; converge only FE tokens/components/state/motion with Admin |
| Admin Storage screen/API | `ĐÃ_CÓ_UI` | Current RC already contains Storage UI, API and `platform.storage.manage` RBAC |
| Admin Live Storage entry point | `MIXED_CẦN_GHÉP` | July production omitted the nav item and derived direct-route access from that menu; current RouteContract fixes both |
| `CHƯA_CÓ_UI` | none reproduced in the 65 Web routes or current Admin Storage scope | Do not invent work; add UI only when later route/action inventory proves it missing |
| `NGHIỆP_VỤ_THẬT_SỰ_CÒN_THIẾU` | none reproduced | Phase 0–7 remains closed |

Selected first G1 vertical slice: `G1-WEB-01 — Visitor → Auth → Portal Dashboard`. Logic/API/RBAC/route contracts are frozen; only the presentation/state seam and behavior-protecting tests may change.

## Hardware identity preflight

- Non-writing `esptool flash_id` verified the attached serial target as ESP32-S3 revision `0.2`, with physical `16MB` flash and `8MB` embedded PSRAM. The detected device identifier is intentionally not copied into this document.
- The existing 16MB partition direction is therefore compatible with physical capacity; exact partition offsets still require build validation before upload.
- Firmware reads two I2S slots on shared `SD=GPIO10`, `BCLK=GPIO11`, `LRCLK=GPIO12`, then mixes them to mono. Physical wiring must use opposite L/R selection; separate-SD/stereo/multiplex support is not inferred.
- G3 must add or enable bounded per-slot RMS/peak diagnostics before claiming that both microphones work independently.
