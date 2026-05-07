const DEFAULT_MEILI_HOST = "http://127.0.0.1:7700";
const DEFAULT_MEILI_INDEX = "bestbuy_products";
const DEFAULT_SEARCH_LIMIT = 10;

function getMeiliConfig() {
  return {
    host: process.env.MEILI_HOST || DEFAULT_MEILI_HOST,
    apiKey: process.env.MEILI_MASTER_KEY || process.env.MEILI_SEARCH_KEY || "",
    indexName: process.env.MEILI_BESTBUY_INDEX || DEFAULT_MEILI_INDEX
  };
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

function normalizePrice(value) {
  const price = Number(value);

  return Number.isFinite(price) ? price : 0;
}

function toSearchResult(hit, sourceInput) {
  const price = normalizePrice(hit.salePrice ?? hit.lowestPrice ?? hit.price);
  const offer = {
    retailer: "BestBuy",
    retailerId: hit.sku,
    name: hit.name,
    price,
    url: hit.url || null,
    image: hit.image || null
  };

  return {
    title: hit.name,
    name: hit.name,
    image: hit.image || null,
    url: hit.url || null,
    sourceInput,
    cheapestPrice: price,
    lowestPrice: price,
    cheapestRetailer: "BestBuy",
    offers: [offer]
  };
}

export async function searchMeiliBestBuyResults(input, options = {}) {
  const { host, apiKey, indexName } = getMeiliConfig();
  const limit = options.limit ?? DEFAULT_SEARCH_LIMIT;
  const response = await fetch(`${host}/indexes/${encodeURIComponent(indexName)}/search`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify({
      q: input,
      limit
    })
  });

  await ensureOk(response, "Meilisearch product search");

  const data = await response.json();
  const hits = Array.isArray(data?.hits) ? data.hits : [];

  return hits
    .filter(hit => hit?.name)
    .map(hit => toSearchResult(hit, input));
}
