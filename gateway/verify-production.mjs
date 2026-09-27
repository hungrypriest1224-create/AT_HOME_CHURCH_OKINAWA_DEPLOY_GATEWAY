import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(here, "config.json"), "utf8"));

function fail(message) {
  throw new Error(message);
}

const requestedPath = process.argv[2] || "/";
if (!requestedPath.startsWith("/") || requestedPath.includes("://") || requestedPath.includes("\\")) {
  fail(`Invalid verification path: ${requestedPath}`);
}

const target = new URL(requestedPath, config.productionUrl);
target.searchParams.set("ahc_verify", Date.now().toString());

try {
  const response = await fetch(target, {
    redirect: "follow",
    headers: {
      "cache-control": "no-cache",
      "user-agent": "AHC-Deploy-Gateway/1.0"
    }
  });

  if (!response.ok) {
    fail(`Production verification failed: HTTP ${response.status} at ${target.origin}${requestedPath}`);
  }

  const body = await response.text();
  if (!body.trim()) {
    fail(`Production verification returned an empty response for ${requestedPath}`);
  }

  if (requestedPath === "/") {
    const hasIdentity =
      body.includes("AT HOME CHURCH OKINAWA") ||
      body.includes("アットホームチャーチ沖縄");
    if (!hasIdentity) {
      fail("Production Home does not contain the expected AHC identity marker.");
    }
  }

  console.log(`Production verification passed: ${response.status} ${target.origin}${requestedPath}`);
} catch (error) {
  console.error(`AHC_PRODUCTION_VERIFY_ERROR: ${error.message}`);
  process.exit(1);
}
