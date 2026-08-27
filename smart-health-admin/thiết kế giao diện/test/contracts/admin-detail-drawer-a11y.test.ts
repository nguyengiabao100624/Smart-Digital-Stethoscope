import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function read(relativePath: string) {
  return readFile(new URL(relativePath, root), "utf8");
}

test("provides one canonical accessible detail drawer primitive", async () => {
  const source = await read("src/components/admin/DetailDrawer.tsx");

  assert.match(source, /@radix-ui\/react-dialog/);
  assert.match(source, /DialogPrimitive\.Root/);
  assert.match(source, /DialogPrimitive\.Root modal/);
  assert.match(source, /DialogPrimitive\.Portal/);
  assert.match(source, /DialogPrimitive\.Overlay/);
  assert.match(source, /DialogPrimitive\.Content/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /DialogPrimitive\.Title/);
  assert.match(source, /DialogPrimitive\.Close/);
  assert.match(source, /onOpenAutoFocus/);
  assert.match(source, /onCloseAutoFocus/);
  assert.match(source, /returnFocusRef/);
  assert.match(source, /addEventListener\("focusin"/);
  assert.match(source, /addEventListener\("pointerdown"/);
  assert.match(source, /returnFocusRef\.current = null/);
  assert.match(source, /useReducedMotion/);
  assert.match(source, /min-h-11/);
  assert.match(source, /min-w-11/);
});

test("uses the canonical drawer for every Platform Admin detail surface", async () => {
  for (const relativePath of [
    "src/components/admin/Doctors.tsx",
    "src/components/admin/DoctorApproval.tsx",
    "src/components/admin/Devices.tsx",
    "src/components/admin/Patients.tsx",
  ]) {
    const source = await read(relativePath);

    assert.match(source, /from "\.\/DetailDrawer"/, `${relativePath} must import DetailDrawer`);
    assert.match(source, /<DetailDrawer\b/, `${relativePath} must render DetailDrawer`);
    assert.doesNotMatch(source, /<motion\.aside\b/, `${relativePath} must not keep a manual aside`);
  }
});
