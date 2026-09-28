import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(here, "config.json"), "utf8"));
const productionOrigin = new URL(config.productionUrl).origin;
const requestedPath = process.argv[2] || "/";
const artifactDir =
  process.env.AHC_BROWSER_ARTIFACT_DIR ||
  path.join(process.env.RUNNER_TEMP || process.cwd(), "ahc-browser-verification");

if (!requestedPath.startsWith("/") || requestedPath.includes("://") || requestedPath.includes("\\")) {
  throw new Error(`Invalid browser verification path: ${requestedPath}`);
}

fs.mkdirSync(artifactDir, { recursive: true });

const READ_KEY = "ahc-home-latest-read-v1";
const MODE_KEY = "ahc-display-mode-v1";
const OPENING_KEY = "ahc-opening-seen-v1";
const results = [];
const globalErrors = [];

function fail(message) {
  throw new Error(message);
}

function dateOf(value) {
  const d = new Date(value || "");
  return Number.isFinite(d.getTime()) ? d : null;
}

function windowDays(item) {
  if (item?.type === "morning") return 2;
  if (item?.type === "worship") return 10;
  if (item?.type === "blog") return 14;
  return 7;
}

function recent(item) {
  const d = dateOf(item?.date);
  if (!d) return false;
  const age = Date.now() - d.getTime();
  return age >= -86400000 && age <= windowDays(item) * 86400000;
}

async function loadMessageState() {
  const target = new URL("/content/message/feed.json", config.productionUrl);
  target.searchParams.set("ahc_browser_verify", Date.now().toString());
  const response = await fetch(target, {
    headers: {
      "cache-control": "no-cache",
      "user-agent": "AHC-Deploy-Gateway-Browser/1.0"
    }
  });
  if (!response.ok) {
    fail(`MESSAGE feed unavailable during browser verification: HTTP ${response.status}`);
  }
  const data = await response.json();
  const stream = Array.isArray(data.stream) ? data.stream : [];
  const published = stream.filter((item) => item && item.status === "published");
  const recentItems = published.filter(recent);
  const recentMessageIds = recentItems.map((item) => `message:${item.id}`);
  const latestMorning =
    published
      .filter((item) => item.type === "morning")
      .sort((a, b) => (dateOf(b.date)?.getTime() || 0) - (dateOf(a.date)?.getTime() || 0))[0] || null;

  return {
    recentItems,
    recentMessageIds,
    latestMorning,
    latestMorningIsRecent: !!latestMorning && recent(latestMorning)
  };
}

function sameOrigin(url) {
  try {
    return new URL(url).origin === productionOrigin;
  } catch {
    return false;
  }
}

function sanitizeName(value) {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-");
}

async function runScenario(browser, options, body) {
  const { name, viewport, mode, readIds = [], locale = "ja-JP" } = options;
  const scenario = {
    name,
    viewport,
    mode,
    startedAt: new Date().toISOString(),
    pageErrors: [],
    consoleErrors: [],
    sameOriginFailures: [],
    assertions: []
  };
  results.push(scenario);

  const context = await browser.newContext({
    viewport,
    locale,
    timezoneId: "Asia/Tokyo",
    reducedMotion: "reduce",
    userAgent: `AHC-Deploy-Gateway-Playwright/1.0 ${name}`
  });

  await context.addInitScript(
    ({ modeValue, readValues, modeKey, readKey, openingKey }) => {
      try {
        localStorage.setItem(modeKey, modeValue);
        localStorage.setItem(readKey, JSON.stringify(readValues));
        sessionStorage.setItem(openingKey, "1");
      } catch (_) {}
    },
    {
      modeValue: mode,
      readValues: readIds,
      modeKey: MODE_KEY,
      readKey: READ_KEY,
      openingKey: OPENING_KEY
    }
  );

  const page = await context.newPage();
  page.on("pageerror", (error) => scenario.pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") scenario.consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    if (sameOrigin(request.url())) {
      scenario.sameOriginFailures.push(
        `requestfailed ${request.method()} ${request.url()} ${request.failure()?.errorText || ""}`.trim()
      );
    }
  });
  page.on("response", (response) => {
    if (sameOrigin(response.url()) && response.status() >= 400) {
      scenario.sameOriginFailures.push(`HTTP ${response.status()} ${response.url()}`);
    }
  });

  const assert = (condition, message) => {
    if (!condition) fail(`${name}: ${message}`);
    scenario.assertions.push(message);
  };

  try {
    await body({ page, context, assert, scenario });
    await page.screenshot({
      path: path.join(artifactDir, `${sanitizeName(name)}.png`),
      fullPage: false
    });

    if (scenario.pageErrors.length) {
      fail(`${name}: page errors: ${scenario.pageErrors.join(" | ")}`);
    }
    if (scenario.consoleErrors.length) {
      fail(`${name}: console errors: ${scenario.consoleErrors.join(" | ")}`);
    }
    if (scenario.sameOriginFailures.length) {
      fail(`${name}: same-origin request failures: ${scenario.sameOriginFailures.join(" | ")}`);
    }

    scenario.status = "passed";
    scenario.completedAt = new Date().toISOString();
    console.log(`BROWSER_VERIFY_PASS: ${name}`);
  } catch (error) {
    scenario.status = "failed";
    scenario.error = error.message;
    scenario.completedAt = new Date().toISOString();
    try {
      await page.screenshot({
        path: path.join(artifactDir, `${sanitizeName(name)}-failure.png`),
        fullPage: false
      });
    } catch (_) {}
    throw error;
  } finally {
    await context.close();
  }
}

async function gotoHome(page, mode) {
  const target = new URL("/", config.productionUrl);
  target.searchParams.set("display", mode);
  target.searchParams.set("ahc_browser_verify", Date.now().toString());
  const response = await page.goto(target.toString(), {
    waitUntil: "domcontentloaded",
    timeout: 45000
  });
  if (!response || !response.ok()) {
    fail(`Home navigation failed for ${mode}: ${response ? response.status() : "no response"}`);
  }
  await page.waitForFunction(
    (expected) => document.documentElement.classList.contains(`ahc-mode-${expected}`),
    mode,
    { timeout: 15000 }
  );
}

async function verifyRequestedPath(page, assert) {
  if (requestedPath === "/") return;
  const target = new URL(requestedPath, config.productionUrl);
  target.searchParams.set("ahc_browser_verify", Date.now().toString());
  const response = await page.goto(target.toString(), {
    waitUntil: "domcontentloaded",
    timeout: 45000
  });
  assert(!!response && response.ok(), `requested path returns success: ${requestedPath}`);
  const text = await page.locator("body").innerText();
  assert(text.trim().length > 0, `requested path has rendered body content: ${requestedPath}`);
}

const messageState = await loadMessageState();
fs.writeFileSync(
  path.join(artifactDir, "message-state.json"),
  JSON.stringify(messageState, null, 2) + "\n",
  "utf8"
);

let browser;
try {
  browser = await chromium.launch({
    headless: true,
    args: ["--enable-webgl", "--ignore-gpu-blocklist"]
  });

  await runScenario(
    browser,
    {
      name: "desktop-globe-unread",
      viewport: { width: 1440, height: 1000 },
      mode: "globe",
      readIds: []
    },
    async ({ page, assert }) => {
      await gotoHome(page, "globe");
      await page.waitForSelector("#globe canvas", { state: "attached", timeout: 30000 });
      await page.waitForFunction(
        () => !!window.AHCHomeGlobe && typeof window.AHCHomeGlobe.globe === "function",
        null,
        { timeout: 30000 }
      );
      const canvasBox = await page.locator("#globe canvas").boundingBox();
      assert(!!canvasBox && canvasBox.width > 300 && canvasBox.height > 300, "desktop Globe canvas has a usable rendered size");

      if (messageState.recentItems.length) {
        const message = page.locator('.orbit-item[data-entry="message"]');
        await page.waitForFunction(
          () => document.querySelector('.orbit-item[data-entry="message"]')?.classList.contains("has-latest"),
          null,
          { timeout: 15000 }
        );
        assert(await message.evaluate((el) => el.classList.contains("has-latest")), "Globe MESSAGE carries recent-content state");
        const badge = page.locator('.semantic-float[data-entry="message"] .semantic-latest-badge');
        await badge.waitFor({ state: "attached", timeout: 15000 });
        assert(String(await badge.textContent()).includes("NEW"), "desktop Globe renders the MESSAGE NEW badge");
      }
    }
  );

  await runScenario(
    browser,
    {
      name: "mobile-globe-read-new-persists",
      viewport: { width: 390, height: 844 },
      mode: "globe",
      readIds: messageState.recentMessageIds
    },
    async ({ page, assert }) => {
      await gotoHome(page, "globe");
      await page.waitForSelector("#globe canvas", { state: "attached", timeout: 30000 });
      const message = page.locator('.orbit-item[data-entry="message"]');

      if (messageState.recentItems.length) {
        await page.waitForFunction(
          () => document.querySelector('.orbit-item[data-entry="message"]')?.classList.contains("has-latest"),
          null,
          { timeout: 15000 }
        );
        assert(await message.evaluate((el) => el.classList.contains("has-latest")), "mobile Orbit keeps has-latest after items are read");
        assert(!(await message.evaluate((el) => el.classList.contains("has-unread"))), "mobile Orbit read state is visually de-emphasized");
        const pseudoContent = await message.locator(".copy").evaluate(
          (el) => getComputedStyle(el, "::before").content
        );
        assert(String(pseudoContent).includes("NEW"), "mobile Orbit NEW label remains visible after read");
      }
    }
  );

  await runScenario(
    browser,
    {
      name: "desktop-light-read-new-persists",
      viewport: { width: 1440, height: 1000 },
      mode: "light",
      readIds: messageState.recentMessageIds
    },
    async ({ page, assert }) => {
      await gotoHome(page, "light");
      const lightApp = page.locator("#lightApp");
      assert(await lightApp.isVisible(), "Light Home is visible");
      assert((await page.locator("#globe canvas").count()) === 0, "Light Home does not initialize the Globe canvas");

      if (messageState.latestMorningIsRecent) {
        const card = page.locator('[data-light-latest="morning"]');
        await page.waitForFunction(
          () => document.querySelector('[data-light-latest="morning"]')?.classList.contains("is-recent"),
          null,
          { timeout: 15000 }
        );
        assert(await card.evaluate((el) => el.classList.contains("is-recent")), "Light Home morning card is marked recent");
        assert(await card.evaluate((el) => el.classList.contains("is-read")), "Light Home morning card records read state");
        assert(await card.locator(".light-new").isVisible(), "Light Home NEW label remains visible after read");
      }

      await page.locator("[data-light-menu-open]").click();
      assert(await page.locator("#lightMenuPanel").getAttribute("aria-hidden") === "false", "Light Home menu opens");
      await page.locator("[data-light-menu-close]").click();
      assert(await page.locator("#lightMenuPanel").getAttribute("aria-hidden") === "true", "Light Home menu closes");
    }
  );

  await runScenario(
    browser,
    {
      name: "mobile-light-message-transition",
      viewport: { width: 390, height: 844 },
      mode: "light",
      readIds: []
    },
    async ({ page, assert }) => {
      await gotoHome(page, "light");
      await page.locator("[data-light-menu-open]").click();
      assert(await page.locator("#lightMenuPanel").getAttribute("aria-hidden") === "false", "mobile Light menu opens");
      await page.locator("[data-light-menu-close]").click();

      const morning = page.locator('[data-light-latest="morning"]');
      await page.waitForFunction(
        () => !document.querySelector('[data-light-latest="morning"]')?.classList.contains("is-loading"),
        null,
        { timeout: 15000 }
      );
      const expectedHref = await morning.getAttribute("href");
      assert(!!expectedHref && expectedHref.includes("/message/"), "mobile Light morning card has a MESSAGE destination");
      await Promise.all([
        page.waitForURL((url) => url.origin === productionOrigin && url.pathname.startsWith("/message/"), { timeout: 30000 }),
        morning.click()
      ]);
      assert(new URL(page.url()).pathname.startsWith("/message/"), "mobile Light card navigates to MESSAGE content");
    }
  );

  await runScenario(
    browser,
    {
      name: "english-route-and-requested-path",
      viewport: { width: 1280, height: 900 },
      mode: "globe",
      readIds: [],
      locale: "en-US"
    },
    async ({ page, assert }) => {
      const target = new URL("/en/", config.productionUrl);
      target.searchParams.set("ahc_browser_verify", Date.now().toString());
      const response = await page.goto(target.toString(), {
        waitUntil: "domcontentloaded",
        timeout: 45000
      });
      assert(!!response && response.ok(), "English Home returns success");
      assert((await page.locator('html').getAttribute("lang")) === "en", "English Home declares lang=en");
      await page.waitForTimeout(500);
      const bibleTodayLinks = page.locator('a[href$="/en/bible-today/"]');
      assert((await bibleTodayLinks.count()) > 0, "English navigation exposes /en/bible-today/");
      await verifyRequestedPath(page, assert);
    }
  );

  console.log("AHC_BROWSER_VERIFICATION_PASSED");
} catch (error) {
  globalErrors.push(error.message);
  console.error(`AHC_BROWSER_VERIFY_ERROR: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  fs.writeFileSync(
    path.join(artifactDir, "browser-verification.json"),
    JSON.stringify(
      {
        schema: 1,
        productionUrl: config.productionUrl,
        requestedPath,
        completedAt: new Date().toISOString(),
        status: process.exitCode ? "failed" : "passed",
        globalErrors,
        scenarios: results
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
}
