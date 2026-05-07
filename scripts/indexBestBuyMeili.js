const DEFAULT_MEILI_HOST = "http://127.0.0.1:7700";
const DEFAULT_MEILI_INDEX = "bestbuy_products";
const BESTBUY_PAGE_SIZE = 50;
const BESTBUY_REQUEST_DELAY_MS = Number(process.env.BESTBUY_REQUEST_DELAY_MS || 1200);
const BESTBUY_MAX_RETRIES = Number(process.env.BESTBUY_MAX_RETRIES || 4);
const BESTBUY_FIELDS = [
  "sku",
  "name",
  "manufacturer",
  "salePrice",
  "regularPrice",
  "url",
  "image",
  "shortDescription",
  "department",
  "class",
  "subclass",
  "categoryPath.id",
  "categoryPath.name"
];
const DEFAULT_SEED_QUERIES = [
  "ipad pro",
  "ipad air",
  "samsung galaxy tab",
  "bose quietcomfort ultra",
  "quietcomfort ultra",
  "mortal kombat",
  "xbox",
  "xbox series",
  "playstation 5",
  "nintendo switch"
];

function getEnv(name, fallback = "") {
  return process.env[name] || fallback;
}

function getSearchTerms(query) {
  return String(query ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map(term => term.trim())
    .filter(Boolean);
}

function buildBestBuyUrl(query, apiKey) {
  const searchExpression = getSearchTerms(query)
    .map(term => `search=${encodeURIComponent(term)}`)
    .join("&");

  return `https://api.bestbuy.com/v1/products(${searchExpression})?apiKey=${apiKey}&format=json&pageSize=${BESTBUY_PAGE_SIZE}&show=${BESTBUY_FIELDS.join(",")}`;
}

function buildHeaders(apiKey) {
  return {
    "Content-Type": "application/json",
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
  };
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

async function ensureOk(response, label) {
  if (response.ok) {
    return;
  }

  const details = await readJsonOrText(response);
  const detailText =
    typeof details === "string" ? details : details?.message || JSON.stringify(details);

  throw new Error(`${label} failed with ${response.status}${detailText ? `: ${detailText}` : ""}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isBestBuyRateLimitResponse(response, details) {
  const message =
    typeof details === "string" ? details : details?.errorMessage || details?.message || "";

  return response.status === 403 && /limit/i.test(message);
}

async function fetchBestBuyJsonWithRetry(url, label) {
  for (let attempt = 0; attempt <= BESTBUY_MAX_RETRIES; attempt += 1) {
    const response = await fetch(url);
    const details = await readJsonOrText(response);

    if (response.ok) {
      return details || {};
    }

    if (isBestBuyRateLimitResponse(response, details) && attempt < BESTBUY_MAX_RETRIES) {
      const waitMs = BESTBUY_REQUEST_DELAY_MS * (attempt + 1);
      console.log(`${label} hit Best Buy rate limit. Waiting ${waitMs}ms before retry ${attempt + 1}/${BESTBUY_MAX_RETRIES}...`);
      await sleep(waitMs);
      continue;
    }

    const detailText =
      typeof details === "string" ? details : details?.message || details?.errorMessage || JSON.stringify(details);

    throw new Error(`${label} failed with ${response.status}${detailText ? `: ${detailText}` : ""}`);
  }

  throw new Error(`${label} failed after ${BESTBUY_MAX_RETRIES} retries`);
}

function normalizeCategoryPath(categoryPath) {
  if (!Array.isArray(categoryPath)) {
    return {
      categoryIds: [],
      categoryNames: []
    };
  }

  return {
    categoryIds: categoryPath.map(item => item?.id).filter(Boolean),
    categoryNames: categoryPath.map(item => item?.name).filter(Boolean)
  };
}

function toDocument(product) {
  const { categoryIds, categoryNames } = normalizeCategoryPath(product.categoryPath);

  return {
    sku: String(product.sku),
    name: product.name,
    manufacturer: product.manufacturer || "",
    salePrice: product.salePrice,
    regularPrice: product.regularPrice,
    url: product.url || "",
    image: product.image || "",
    shortDescription: product.shortDescription || "",
    department: product.department || "",
    class: product.class || "",
    subclass: product.subclass || "",
    categoryIds,
    categoryNames
  };
}

function dedupeBySku(products) {
  const seen = new Set();

  return products.filter(product => {
    const sku = product?.sku;

    if (!sku || seen.has(sku)) {
      return false;
    }

    seen.add(sku);
    return true;
  });
}

async function fetchBestBuyProducts(query, apiKey) {
  const data = await fetchBestBuyJsonWithRetry(
    buildBestBuyUrl(query, apiKey),
    `Best Buy query "${query}"`
  );

  return Array.isArray(data?.products) ? data.products : [];
}

async function waitForTask(host, apiKey, taskUid) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await fetch(`${host}/tasks/${taskUid}`, {
      headers: buildHeaders(apiKey)
    });

    await ensureOk(response, `Meilisearch task ${taskUid}`);

    const task = await response.json();

    if (task.status === "succeeded") {
      return task;
    }

    if (task.status === "failed") {
      throw new Error(`Meilisearch task ${taskUid} failed: ${task.error?.message || "Unknown error"}`);
    }

    await new Promise(resolve => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for Meilisearch task ${taskUid}`);
}

async function updateIndexSettings(host, apiKey, indexName) {
  const response = await fetch(`${host}/indexes/${encodeURIComponent(indexName)}/settings`, {
    method: "PATCH",
    headers: buildHeaders(apiKey),
    body: JSON.stringify({
      searchableAttributes: [
        "name",
        "manufacturer",
        "categoryNames",
        "class",
        "subclass",
        "shortDescription"
      ],
      displayedAttributes: [
        "sku",
        "name",
        "manufacturer",
        "salePrice",
        "regularPrice",
        "url",
        "image",
        "categoryNames",
        "department",
        "class",
        "subclass"
      ],
      rankingRules: [
        "words",
        "typo",
        "proximity",
        "attribute",
        "sort",
        "exactness"
      ],
      filterableAttributes: [
        "manufacturer",
        "department",
        "class",
        "subclass",
        "categoryIds",
        "categoryNames"
      ],
      sortableAttributes: [
        "salePrice",
        "regularPrice"
      ]
    })
  });

  await ensureOk(response, "Meilisearch settings update");

  const task = await response.json();
  await waitForTask(host, apiKey, task.taskUid);
}

async function addDocuments(host, apiKey, indexName, documents) {
  const response = await fetch(
    `${host}/indexes/${encodeURIComponent(indexName)}/documents?primaryKey=sku`,
    {
      method: "POST",
      headers: buildHeaders(apiKey),
      body: JSON.stringify(documents)
    }
  );

  await ensureOk(response, "Meilisearch document indexing");

  const task = await response.json();
  await waitForTask(host, apiKey, task.taskUid);
}

async function main() {
  const bestBuyApiKey = getEnv("BESTBUY_API_KEY");
  const meiliHost = getEnv("MEILI_HOST", DEFAULT_MEILI_HOST);
  const meiliKey = getEnv("MEILI_MASTER_KEY");
  const indexName = getEnv("MEILI_BESTBUY_INDEX", DEFAULT_MEILI_INDEX);
  const seedQueries = process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : DEFAULT_SEED_QUERIES;

  if (!bestBuyApiKey) {
    throw new Error("Set BESTBUY_API_KEY before running the indexer.");
  }

  const products = [];

  for (const query of seedQueries) {
    console.log(`Fetching Best Buy products for "${query}"...`);
    products.push(...await fetchBestBuyProducts(query, bestBuyApiKey));
    await sleep(BESTBUY_REQUEST_DELAY_MS);
  }

  const documents = dedupeBySku(products)
    .filter(product => product?.name && typeof product?.salePrice === "number")
    .map(toDocument);

  console.log(`Indexing ${documents.length} Best Buy products into ${indexName}...`);
  await updateIndexSettings(meiliHost, meiliKey, indexName);
  await addDocuments(meiliHost, meiliKey, indexName, documents);
  console.log("Done.");
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
