/* global document, getComputedStyle, innerWidth, window */

import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";

import { routeContracts } from "../src/app/contracts/route-contract.ts";

const siteUrl = (process.env.SMART_HEALTH_WEB_URL || "http://127.0.0.1:8080").replace(
  /\/+$/,
  "",
);

const viewportMatrix = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 1000 },
];

const themeMatrix = [
  { preference: "light", colorScheme: "light" },
  { preference: "dark", colorScheme: "dark" },
  { preference: "system", colorScheme: "dark" },
];

function readFilter(name) {
  const prefix = `--${name}=`;
  return (
    process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ||
    process.env[`SMOKE_AUTH_${name.toUpperCase()}`] ||
    ""
  ).trim();
}

const routeFilter = readFilter("route");
const viewportFilter = readFilter("viewport");
const themeFilter = readFilter("theme");
const authRoutes = routeContracts.filter(
  (route) =>
    route.surface === "auth" &&
    (!routeFilter || route.id.includes(routeFilter) || route.smokeId.includes(routeFilter)),
);
const viewports = viewportMatrix.filter(
  (viewport) => !viewportFilter || viewport.name === viewportFilter,
);
const themes = themeMatrix.filter(
  (theme) => !themeFilter || theme.preference === themeFilter,
);
const failures = [];
let checks = 0;

function describeFailure(route, viewport, theme, message) {
  return `${route.smokeId} ${viewport.width}x${viewport.height} ${theme.preference}: ${message}`;
}

const browser = await chromium.launch({ headless: true });

try {
  for (const viewport of viewports) {
    for (const theme of themes) {
      const context = await browser.newContext({
        viewport,
        colorScheme: theme.colorScheme,
        reducedMotion: "reduce",
        locale: "vi-VN",
      });
      await context.addInitScript((preference) => {
        window.localStorage.setItem("shcare-theme", preference);
      }, theme.preference);
      const page = await context.newPage();
      const runtimeErrors = [];
      const staticAssetErrors = [];

      page.on("console", (message) => {
        if (message.type() === "error") runtimeErrors.push(message.text());
      });
      page.on("pageerror", (error) => runtimeErrors.push(error.message));
      page.on("response", (response) => {
        const resourceType = response.request().resourceType();
        if (
          response.status() >= 400 &&
          ["document", "stylesheet", "script", "font", "image"].includes(resourceType)
        ) {
          staticAssetErrors.push(`${response.status()} ${response.url()}`);
        }
      });

      for (const route of authRoutes) {
        runtimeErrors.length = 0;
        staticAssetErrors.length = 0;
        await page.goto(`${siteUrl}${route.path}`, {
          waitUntil: "networkidle",
          timeout: 30_000,
        });
        await page.locator("#shcare-auth-main").waitFor({ state: "visible" });

        const layout = await page.evaluate(() => {
          const root = document.documentElement;
          const main = document.querySelector("#shcare-auth-main");
          const tinyTargets = Array.from(
            document.querySelectorAll(
              'button, input:not([type="hidden"]), select, textarea, [role="button"], a',
            ),
          )
            .filter((element) => {
              const style = getComputedStyle(element);
              const rect = element.getBoundingClientRect();
              if (style.display === "none" || style.visibility === "hidden") return false;
              if (rect.width === 0 || rect.height === 0) return false;
              if (element.tagName === "A" && style.display === "inline") return false;
              return rect.width < 44 || rect.height < 44;
            })
            .map((element) => {
              const rect = element.getBoundingClientRect();
              const name =
                element.getAttribute("aria-label") || element.textContent?.trim() || element.id;
              return `${element.tagName.toLowerCase()}[${Math.round(rect.width)}x${Math.round(rect.height)}] ${name}`;
            });
          return {
            theme: root.dataset.theme,
            overflow: root.scrollWidth - innerWidth,
            mainVisible: Boolean(main && main.getBoundingClientRect().height > 0),
            tinyTargets,
          };
        });

        if (layout.theme !== theme.preference) {
          failures.push(
            describeFailure(
              route,
              viewport,
              theme,
              `theme=${layout.theme || "missing"}`,
            ),
          );
        }
        if (layout.overflow > 1) {
          failures.push(
            describeFailure(route, viewport, theme, `horizontal overflow ${layout.overflow}px`),
          );
        }
        if (!layout.mainVisible) {
          failures.push(describeFailure(route, viewport, theme, "auth main is not visible"));
        }
        if (layout.tinyTargets.length) {
          failures.push(
            describeFailure(
              route,
              viewport,
              theme,
              `targets below 44px: ${layout.tinyTargets.slice(0, 8).join(", ")}`,
            ),
          );
        }

        const axe = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        const blockingViolations = axe.violations.filter((violation) =>
          ["serious", "critical"].includes(violation.impact || ""),
        );
        for (const violation of blockingViolations) {
          failures.push(
            describeFailure(
              route,
              viewport,
              theme,
              `axe ${violation.impact} ${violation.id}: ${violation.nodes
                .slice(0, 3)
                .map(
                  (node) =>
                    `${node.target.join(" ")} (${node.failureSummary || node.html})`,
                )
                .join(", ")}`,
            ),
          );
        }
        for (const error of runtimeErrors) {
          failures.push(describeFailure(route, viewport, theme, `console: ${error}`));
        }
        for (const error of staticAssetErrors) {
          failures.push(describeFailure(route, viewport, theme, `asset: ${error}`));
        }
        checks += 1;
      }

      await context.close();
    }
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`Auth browser smoke failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Auth browser smoke passed: ${checks} route/viewport/theme checks, zero serious/critical axe issues, console errors, static asset failures, overflow, or undersized standalone targets.`,
  );
}
