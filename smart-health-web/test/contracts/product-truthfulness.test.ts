import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const truthSensitivePages = [
  "../../index.html",
  "../../public/llms.txt",
  "../../src/app/pages/public/DevicePage.tsx",
  "../../src/app/pages/public/PatientHomePage.tsx",
  "../../src/app/pages/public/RPMGuidePage.tsx",
  "../../src/app/pages/public/FAQPage.tsx",
  "../../src/app/pages/public/SecurityPage.tsx",
  "../../src/app/pages/public/HomePage.tsx",
  "../../src/app/pages/public/ClinicSolutionPage.tsx",
  "../../src/app/pages/public/DoctorSolutionPage.tsx",
  "../../src/app/pages/portal/RecordsPage.tsx",
  "../../src/app/pages/portal/ScanDetail.tsx",
  "../../src/app/pages/portal/ReportsPage.tsx",
  "../../src/app/pages/portal/WorkspaceSettings.tsx",
  "../../src/app/pages/portal/BillingSummaryPage.tsx",
];

const unsupportedClaims = [
  /AI Medical Analysis/i,
  /Kết quả AI/i,
  /AI hỗ trợ chẩn đoán/i,
  /AI tự động phát hiện/i,
  /AI xử lý tín hiệu ngay trên thiết bị/i,
  /thiết bị y tế cấp phép/i,
  /Bluetooth/i,
  /24-bit/i,
  /(?:lưu|bộ nhớ).{0,30}2GB/i,
  /Google Play/i,
  /\bpin\b/i,
  /8\s*[-–]\s*12 giờ/i,
  /dưới 20%/i,
  /đăng nhập bằng số điện thoại/i,
  /mã hóa (?:end-to-end|toàn trình)/i,
  /(?:1\s*[–-]\s*2 tuần|1\s*[–-]\s*3 ngày)/i,
  /25\s*[–-]\s*50%/i,
  /5\s*[–-]\s*10 phút/i,
];

test("does not advertise unsupported clinical AI or certification claims", () => {
  for (const relativePath of truthSensitivePages) {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    for (const unsupportedClaim of unsupportedClaims) {
      assert.equal(
        unsupportedClaim.test(source),
        false,
        `${relativePath} contains unsupported claim ${unsupportedClaim}`,
      );
    }
  }
});

test("uses Shcare as the primary visible and document brand", () => {
  const indexSource = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const publicLayoutSource = readFileSync(
    new URL("../../src/app/layouts/PublicLayout.tsx", import.meta.url),
    "utf8",
  );

  assert.match(indexSource, /<title>Shcare \|/);
  assert.match(indexSource, /content="Shcare — nền tảng Smart Health Care/);
  assert.match(publicLayoutSource, /aria-label="Shcare — Smart Health Care"/);
  assert.match(publicLayoutSource, /<span>Shcare<\/span>/);
});

test("keeps the public hero CTA and device claims aligned with the approved contract", () => {
  const homeSource = readFileSync(
    new URL("../../src/app/pages/public/HomePage.tsx", import.meta.url),
    "utf8",
  );

  assert.match(homeSource, /Đăng ký sử dụng/);
  assert.match(homeSource, /Xem giải pháp/);
  assert.doesNotMatch(homeSource, /\bpin\b/i);
});
