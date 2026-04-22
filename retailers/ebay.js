const EBAY_OAUTH_SCOPE = "https://api.ebay.com/oauth/api_scope";
const EBAY_OAUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_BROWSE_URL = "https://api.ebay.com/buy/browse/v1";
const TOKEN_EXPIRY_BUFFER_MS = 30 * 1000;

let cachedAccessToken = null;
let accessTokenExpiresAt = 0;

function getRequiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

async function readJsonOrText(response) {
  const text = await response.text();

  if (!text) {
    return "";
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function formatErrorDetails(details) {
  if (!details) {
    return "";
  }

  if (typeof details === "string") {
    return details;
  }

  const errors = Array.isArray(details.errors)
    ? details.errors.map((error) => error?.message).filter(Boolean)
    : [];

  if (errors.length > 0) {
    return errors.join("; ");
  }

  return JSON.stringify(details);
}

async function ensureOk(response, label) {
  if (response.ok) {
    return;
  }

  const details = await readJsonOrText(response);
  const suffix = formatErrorDetails(details);

  throw new Error(
    `${label} failed with ${response.status}${suffix ? `: ${suffix}` : ""}`
  );
}

export function resetEbayAccessTokenCache() {
  cachedAccessToken = null;
  accessTokenExpiresAt = 0;
}

async function getEbayAccessToken() {
  if (
    cachedAccessToken &&
    Date.now() < accessTokenExpiresAt - TOKEN_EXPIRY_BUFFER_MS
  ) {
    return cachedAccessToken;
  }

  const clientId = getRequiredEnv("EBAY_CLIENT_ID");
  const clientSecret = getRequiredEnv("EBAY_CLIENT_SECRET");
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(EBAY_OAUTH_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: EBAY_OAUTH_SCOPE
    }).toString()
  });

  await ensureOk(response, "eBay OAuth token request");

  const data = await response.json();

  if (!data.access_token) {
    throw new Error("eBay OAuth token response did not include an access token");
  }

  cachedAccessToken = data.access_token;
  accessTokenExpiresAt = Date.now() + Number(data.expires_in || 0) * 1000;

  return cachedAccessToken;
}

function normalizeEbayItem(item) {
  const price = Number.parseFloat(item?.price?.value);

  return {
    retailer: "eBay",
    retailerId: item.itemId,
    name: item.title,
    price: Number.isFinite(price) ? price : null,
    url: item.itemWebUrl || item.itemAffiliateWebUrl || null,
    image: item.image?.imageUrl || null
  };
}

export async function searchEbay(query) {
  const accessToken = await getEbayAccessToken();
  const url = `${EBAY_BROWSE_URL}/item_summary/search?q=${encodeURIComponent(query)}&limit=5`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US"
    }
  });

  await ensureOk(response, "eBay search request");

  const data = await response.json();

  return (data.itemSummaries || [])
    .map(normalizeEbayItem)
    .filter((item) => item.name);
}
