import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) =>
  readFile(new URL(`../../src/components/admin/${path}`, import.meta.url), "utf8");

test("Platform Admin exposes real audited controls for each governed data domain", async () => {
  const [patients, doctors, clinics, devices, accounts, api] = await Promise.all([
    source("Patients.tsx"),
    source("Doctors.tsx"),
    source("Clinics.tsx"),
    source("Devices.tsx"),
    source("AdminAccounts.tsx"),
    readFile(new URL("../../src/lib/smart-health-api.ts", import.meta.url), "utf8"),
  ]);

  assert.match(patients, /openEdit\(selectedPatient\)/);
  assert.match(patients, /requestDelete\(selectedPatient\)/);
  assert.match(clinics, /openEditDialog/);
  assert.match(clinics, /Lưu trữ workspace/);
  assert.match(devices, /<EditDeviceDialog/);
  assert.match(devices, /<AssignDevicePatientDialog/);
  assert.match(devices, /<TransferDeviceDialog/);
  assert.match(accounts, /saveSelected/);
  assert.match(accounts, /askLockToggle/);
  assert.match(accounts, /askDelete/);

  for (const field of [
    "name",
    "phone",
    "title",
    "address",
    "license",
    "hospital",
    "department",
    "specialty",
  ]) {
    assert.match(doctors, new RegExp(`\\["${field}",\\s*"`));
  }
  assert.match(doctors, /name=\{field\}/);

  assert.match(api, /updateDoctorProfile/);
  assert.match(api, /updatePatient/);
  assert.match(api, /updateClinic/);
  assert.match(api, /patchDevice/);
  assert.match(api, /updateAdminAccount/);
});

test("admin data controls do not expose credential or device-secret values", async () => {
  const [devices, accounts] = await Promise.all([
    source("Devices.tsx"),
    source("AdminAccounts.tsx"),
  ]);
  assert.doesNotMatch(devices, /device\.secret(?:Hash)?/);
  assert.doesNotMatch(accounts, /firebaseToken|refreshToken|serviceAccount/i);
});
