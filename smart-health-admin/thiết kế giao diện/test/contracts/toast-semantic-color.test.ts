import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const toasterPath = new URL("../../src/components/ui/sonner.tsx", import.meta.url);
const stylesPath = new URL("../../src/styles.css", import.meta.url);

test("Admin toasts use rich semantic icons instead of inheriting black foreground", async () => {
  const [toaster, styles] = await Promise.all([
    readFile(toasterPath, "utf8"),
    readFile(stylesPath, "utf8"),
  ]);

  assert.match(toaster, /richColors/);
  assert.match(toaster, /success:\s*[\s\S]*?\[&_\[data-icon\]\]:text-success/);
  assert.match(toaster, /error:\s*[\s\S]*?\[&_\[data-icon\]\]:text-destructive/);
  assert.match(styles, /\[data-sonner-toast\]\[data-type="success"\].*var\(--success\)/s);
  assert.match(styles, /\[data-sonner-toast\]\[data-type="error"\].*var\(--destructive\)/s);
  assert.match(styles, /\[data-sonner-toast\]\[data-type="warning"\].*var\(--warning\)/s);
  assert.match(styles, /\[data-sonner-toast\]\[data-type="info"\].*var\(--info\)/s);
});
