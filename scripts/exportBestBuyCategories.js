import fs from "fs";
import path from "path";

const DEFAULT_OUTPUT_PATH = "data/bestbuy-categories.json";
const CATEGORY_PAGE_SIZE = Number(process.env.BESTBUY_CATEGORY_PAGE_SIZE || 100);
const BESTBUY_REQUEST_DELAY_MS = Number(process.env.BESTBUY_REQUEST_DELAY_MS || 1200);
const BESTBUY_MAX_RETRIES = Number(process.env.BESTBUY_MAX_RETRIES || 4);
const CATEGORY_FIELDS = [
  "id",
  "name",
  "path.id",
  "path.name"
];

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), ".env.local");

  if (!fs.existsSync(envPath)) {
    return;
  }

  const entries = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const entry of entries) {
    const trimmed = entry.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [key, ...valueParts] = trimmed.split("=");
    const value = valueParts.join("=").trim().replace(/^['"]|['"]$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function readJsonOrText(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isRateLimitResponse(response, details) {
  const message =
    typeof details === "string" ? details : details?.errorMessage || details?.message || "";

  return response.status === 403 && /limit/i.test(message);
}

async function fetchJsonWithRetry(url, label) {
  for (let attempt = 0; attempt <= BESTBUY_MAX_RETRIES; attempt += 1) {
    const response = await fetch(url);
    const details = await readJsonOrText(response);

    if (response.ok) {
      return details || {};
    }

    if (isRateLimitResponse(response, details) && attempt < BESTBUY_MAX_RETRIES) {
      const waitMs = BESTBUY_REQUEST_DELAY_MS * (attempt + 1);
      console.log(`${label} hit Best Buy rate limit. Waiting ${waitMs}ms before retry ${attempt + 1}/${BESTBUY_MAX_RETRIES}...`);
      await sleep(waitMs);
      continue;
    }

    const detailText =
      typeof details === "string" ? details : details?.errorMessage || details?.message || JSON.stringify(details);

    throw new Error(`${label} failed with ${response.status}${detailText ? `: ${detailText}` : ""}`);
  }

  throw new Error(`${label} failed after ${BESTBUY_MAX_RETRIES} retries`);
}

function buildCategoriesUrl(apiKey, page) {
  return `https://api.bestbuy.com/v1/categories?apiKey=${encodeURIComponent(apiKey)}&format=json&pageSize=${CATEGORY_PAGE_SIZE}&page=${page}&show=${CATEGORY_FIELDS.join(",")}`;
}

function normalizeCategory(category) {
  return {
    id: String(category.id || ""),
    name: category.name || "",
    path: Array.isArray(category.path)
      ? category.path.map(pathItem => ({
          id: String(pathItem?.id || ""),
          name: pathItem?.name || ""
        })).filter(pathItem => pathItem.id || pathItem.name)
      : []
  };
}

async function main() {
  loadLocalEnv();

  const apiKey = process.env.BESTBUY_API_KEY;
  const outputPath = path.resolve(process.cwd(), process.env.BESTBUY_CATEGORY_OUTPUT || DEFAULT_OUTPUT_PATH);

  if (!apiKey) {
    throw new Error("Set BESTBUY_API_KEY in the shell or backend/.env.local before exporting categories.");
  }

  const firstPage = await fetchJsonWithRetry(buildCategoriesUrl(apiKey, 1), "Best Buy categories page 1");
  const totalPages = Number(firstPage.totalPages || 1);
  const total = Number(firstPage.total || firstPage.categories?.length || 0);
  const categories = Array.isArray(firstPage.categories) ? firstPage.categories.map(normalizeCategory) : [];

  console.log(`Best Buy reports ${total} categories across ${totalPages} pages.`);

  for (let page = 2; page <= totalPages; page += 1) {
    await sleep(BESTBUY_REQUEST_DELAY_MS);
    console.log(`Fetching categories page ${page}/${totalPages}...`);
    const data = await fetchJsonWithRetry(buildCategoriesUrl(apiKey, page), `Best Buy categories page ${page}`);
    categories.push(...(Array.isArray(data.categories) ? data.categories.map(normalizeCategory) : []));
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    JSON.stringify({
      exportedAt: new Date().toISOString(),
      source: "Best Buy Categories API",
      totalReported: total,
      totalExported: categories.length,
      categories
    }, null, 2)
  );

  console.log(`Wrote ${categories.length} categories to ${outputPath}`);
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
