import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const apiPath = new URL("../../src/lib/smart-health-api.ts", import.meta.url);
const patientsPath = new URL("../../src/components/admin/Patients.tsx", import.meta.url);
const doctorsPath = new URL("../../src/components/admin/Doctors.tsx", import.meta.url);
const devicesPath = new URL("../../src/components/admin/Devices.tsx", import.meta.url);
const packagesPath = new URL("../../src/components/admin/Packages.tsx", import.meta.url);
const storagePath = new URL("../../src/components/admin/Storage.tsx", import.meta.url);
const backendContractPath = new URL(
  "../../../../smart-health-embedded/web-monitor/src/adminListContract.js",
  import.meta.url,
);
const backendServerPath = new URL(
  "../../../../smart-health-embedded/web-monitor/server.js",
  import.meta.url,
);

test("admin list API preserves bodies while reading canonical pagination headers", async () => {
  const [api, contract, server] = await Promise.all([
    readFile(apiPath, "utf8"),
    readFile(backendContractPath, "utf8"),
    readFile(backendServerPath, "utf8"),
  ]);

  for (const method of [
    "listPatients",
    "listApprovedDoctors",
    "listDevices",
    "listPackages",
    "listStorageFiles",
  ]) {
    assert.match(api, new RegExp(`async ${method}\\(`));
  }
  assert.match(api, /readListPagination/);
  assert.match(api, /X-Total-Count/);
  assert.match(api, /X-Page-Limit/);
  assert.match(contract, /paginationRequested/);
  assert.match(contract, /MAX_LIMIT = 100/);
  assert.match(server, /resolveAdminListPage/);
  assert.match(server, /setWorkspacePaginationHeaders\(res, pageResult\)/);
});

test("remaining admin list surfaces use backend search, filters, sorting and page totals", async () => {
  const [patients, doctors, devices, packages, storage] = await Promise.all([
    readFile(patientsPath, "utf8"),
    readFile(doctorsPath, "utf8"),
    readFile(devicesPath, "utf8"),
    readFile(packagesPath, "utf8"),
    readFile(storagePath, "utf8"),
  ]);

  for (const source of [patients, doctors, devices, packages, storage]) {
    assert.match(source, /pageSize=\{pagination\.limit\}/);
    assert.match(source, /totalItems=\{pagination\.totalCount\}/);
    assert.match(source, /sort: "/);
  }
  assert.match(doctors, /response\.facets\?\.specialties/);
  assert.match(devices, /response\.summary/);
  assert.match(packages, /assignedByPackage/);
  assert.doesNotMatch(packages, /smartHealthApi\.listClinics\(\)/);
});
