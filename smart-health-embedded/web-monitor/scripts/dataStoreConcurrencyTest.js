const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const { JsonDataStore } = require("../src/dataStore");

function createTempStore(fileSystem = fs) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "shcare-json-store-"));
  const dbFile = path.join(directory, "db.json");
  const store = new JsonDataStore({
    dbFile,
    createEmptyDb: () => ({}),
    normalizeDb: (value) => value,
    ensureDataDirs: () => fs.mkdirSync(directory, { recursive: true }),
    fileSystem,
  });
  return { directory, dbFile, store };
}

test("JSON storage falls back safely when Windows rename reports EPERM", async (t) => {
  let renameCalls = 0;
  const fileSystem = {
    promises: {
      writeFile: (...args) => fs.promises.writeFile(...args),
      rename: async (...args) => {
        renameCalls += 1;
        if (renameCalls === 1) {
          const error = new Error("simulated Windows destination lock");
          error.code = "EPERM";
          throw error;
        }
        return fs.promises.rename(...args);
      },
      unlink: (...args) => fs.promises.unlink(...args),
    },
    existsSync: (...args) => fs.existsSync(...args),
  };
  const { directory, dbFile, store } = createTempStore(fileSystem);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  await store.save({ revision: 1, state: "safe" });
  assert.equal(renameCalls, 2);
  assert.deepEqual(JSON.parse(fs.readFileSync(dbFile, "utf8")), {
    revision: 1,
    state: "safe",
  });
  assert.deepEqual(
    fs.readdirSync(directory).filter((name) => name.endsWith(".tmp")),
    [],
    "temporary files must be cleaned after atomic swap fallback",
  );
});

test("JSON storage serializes concurrent callers and snapshots each payload", async (t) => {
  const { directory, dbFile, store } = createTempStore();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const first = { revision: 1, nested: { value: "first" } };
  const second = { revision: 2, nested: { value: "second" } };

  const firstSave = store.save(first);
  first.nested.value = "mutated-after-save";
  const secondSave = store.save(second);
  await Promise.all([firstSave, secondSave]);
  await store.close();

  assert.deepEqual(JSON.parse(fs.readFileSync(dbFile, "utf8")), second);
  assert.deepEqual(
    fs.readdirSync(directory).filter((name) => name.endsWith(".tmp")),
    [],
  );
});
