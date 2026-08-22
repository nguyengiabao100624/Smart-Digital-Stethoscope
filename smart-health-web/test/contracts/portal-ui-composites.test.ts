import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL("../..", import.meta.url));
const canonicalRoot = path.join(webRoot, "src", "components", "ui");

const compositeFiles = [
  "page-header.tsx",
  "filter-bar.tsx",
  "data-table-shell.tsx",
  "status-badge.tsx",
  "state-surface.tsx",
] as const;

function read(relativePath: string) {
  return readFileSync(path.join(webRoot, relativePath), "utf8");
}

test("keeps Portal composites in the canonical React UI tree", () => {
  for (const file of compositeFiles) {
    assert.equal(
      existsSync(path.join(canonicalRoot, file)),
      true,
      `${file} is missing`,
    );
  }

  const records = read("src/app/pages/portal/RecordsPage.tsx");
  const reports = read("src/app/pages/portal/ReportsPage.tsx");
  for (const composite of [
    "page-header",
    "data-table-shell",
    "status-badge",
    "state-surface",
  ]) {
    assert.match(records, new RegExp(`components/ui/${composite}`));
    assert.match(reports, new RegExp(`components/ui/${composite}`));
  }
  assert.match(records, /components\/ui\/filter-bar/);
});

test("composites encode responsive access, 44px actions and semantic theme colors", () => {
  const source = compositeFiles
    .map((file) => read(`src/components/ui/${file}`))
    .join("\n");
  const dataTable = read("src/components/ui/data-table-shell.tsx");
  const filterBar = read("src/components/ui/filter-bar.tsx");
  const statusBadge = read("src/components/ui/status-badge.tsx");

  assert.match(dataTable, /role="region"/);
  assert.match(dataTable, /aria-label=\{label\}/);
  assert.match(dataTable, /tabIndex=\{0\}/);
  assert.match(dataTable, /overflow-x-auto/);
  assert.match(filterBar, /"aria-label": string/);
  assert.match(source, /min-h-11/);
  assert.match(source, /bg-card/);
  assert.match(source, /text-card-foreground/);
  for (const tone of ["info", "success", "warning", "danger"]) {
    assert.match(statusBadge, new RegExp(`var\\(--status-${tone}-bg\\)`));
    assert.match(statusBadge, new RegExp(`var\\(--status-${tone}-fg\\)`));
  }
  assert.doesNotMatch(statusBadge, /(?:emerald|amber|red|blue)-\d+/);
  assert.doesNotMatch(statusBadge, /#[0-9a-f]{3,8}\b/i);
});
