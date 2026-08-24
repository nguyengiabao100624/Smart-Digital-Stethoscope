import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const loginPath = new URL("../../src/components/admin/Login.tsx", import.meta.url);

test("demo login accepts a username while production remains email-based", async () => {
  const source = await readFile(loginPath, "utf8");

  assert.match(source, /type=\{productionAuthMode \? "email" : "text"\}/);
  assert.match(source, /autoComplete=\{productionAuthMode \? "email" : "username"\}/);
  assert.match(source, /Email hoặc tên tài khoản demo/);
});

test("login never bypasses backend or Firebase authentication", async () => {
  const source = await readFile(loginPath, "utf8");

  assert.doesNotMatch(source, /email === "admin@smarthealth\.vn"/);
  assert.doesNotMatch(source, /password === "admin"/);
  assert.match(source, /await smartHealthApi\.login\(email, password\)/);
  assert.match(source, /await signInWithFirebaseEmail\(email, password\)/);
});
