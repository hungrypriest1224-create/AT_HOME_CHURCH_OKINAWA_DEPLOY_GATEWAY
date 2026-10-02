import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(here, "config.json"), "utf8"));

function fail(message) {
  throw new Error(message);
}

function withCacheBust(url, key) {
  const target = new URL(url);
  target.searchParams.set(key, Date.now().toString());
  return target;
}

async function fetchChecked({ url, label, userAgent, requireIdentity = false, requireText }) {
  const response = await fetch(withCacheBust(url, "ahc_verify"), {
    redirect: "follow",
    headers: {
      "cache-control": "no-cache",
      "user-agent": userAgent
    }
  });

  if (!response.ok) {
    fail(`${label} failed: HTTP ${response.status} at ${response.url || url}`);
  }

  const body = await response.text();
  if (!body.trim()) {
    fail(`${label} returned an empty response at ${response.url || url}`);
  }

  if (requireIdentity) {
    const hasIdentity =
      body.includes("AT HOME CHURCH OKINAWA") ||
      body.includes("アットホームチャーチ沖縄");
    if (!hasIdentity) {
      fail(`${label} did not contain the expected AHC identity marker.`);
    }
  }

  if (requireText && !body.includes(requireText)) {
    fail(`${label} did not contain required text: ${requireText}`);
  }

  console.log(`${label} passed: ${response.status} ${response.url || url}`);
  return { response, body };
}

const requestedPath = process.argv[2] || "/";
if (!requestedPath.startsWith("/") || requestedPath.includes("://") || requestedPath.includes("\\")) {
  fail(`Invalid verification path: ${requestedPath}`);
}

const production = new URL(config.productionUrl);
const requestedUrl = new URL(requestedPath, production);
const homeUrl = new URL("/", production);
const robotsUrl = new URL("/robots.txt", production);
const sitemapUrl = new URL("/sitemap.xml", production);

const OAI_SEARCHBOT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36; compatible; OAI-SearchBot/1.4; +https://openai.com/searchbot";
const CHATGPT_USER_UA =
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot";

try {
  await fetchChecked({
    url: requestedUrl,
    label: "Production runtime verification",
    userAgent: "AHC-Deploy-Gateway/1.1",
    requireIdentity: requestedPath === "/"
  });

  await fetchChecked({
    url: homeUrl,
    label: "OAI-SearchBot Home verification",
    userAgent: OAI_SEARCHBOT_UA,
    requireIdentity: true
  });

  const { body: robotsBody } = await fetchChecked({
    url: robotsUrl,
    label: "OAI-SearchBot robots.txt verification",
    userAgent: `${OAI_SEARCHBOT_UA}; robots.txt`,
    requireText: "Sitemap: https://athchurch.org/sitemap.xml"
  });

  if (/User-agent:\s*OAI-SearchBot[\s\S]*?Disallow:\s*\/\s*(?:\r?\n|$)/i.test(robotsBody)) {
    fail("robots.txt explicitly blocks OAI-SearchBot from the site root.");
  }

  await fetchChecked({
    url: sitemapUrl,
    label: "OAI-SearchBot sitemap verification",
    userAgent: OAI_SEARCHBOT_UA,
    requireText: "https://athchurch.org/"
  });

  await fetchChecked({
    url: homeUrl,
    label: "ChatGPT-User Home verification",
    userAgent: CHATGPT_USER_UA,
    requireIdentity: true
  });

  console.log("AHC_CRAWLER_ACCESS_VERIFICATION_PASSED");
} catch (error) {
  console.error(`AHC_PRODUCTION_VERIFY_ERROR: ${error.message}`);
  process.exit(1);
}
