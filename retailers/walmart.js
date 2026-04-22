const WALMART_RAPIDAPI_HOST = "walmart-api4.p.rapidapi.com";

function buildRapidApiHeaders(apiKey) {
  return {
    "Content-Type": "application/json",
    "X-RapidAPI-Key": apiKey,
    "X-RapidAPI-Host": WALMART_RAPIDAPI_HOST
  };
}

function parseWalmartPrice(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/[^0-9.]/g, "");
  const parsed = Number.parseFloat(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function extractWalmartIdFromUrl(url) {
  if (typeof url !== "string" || !url) {
    return null;
  }

  try {
    const { pathname } = new URL(url);
    const segments = pathname.split("/").filter(Boolean);
    const ipIndex = segments.indexOf("ip");

    if (ipIndex === -1) {
      return null;
    }

    const tail = segments.slice(ipIndex + 1);
    return tail.length > 0 ? tail[tail.length - 1] : null;
  } catch {
    return null;
  }
}

function normalizeSearchItem(item) {
  return {
    retailer: "Walmart",
    retailerId: extractWalmartIdFromUrl(item.link) || item.link || null,
    name: item.title,
    price: parseWalmartPrice(item.price?.currentPrice),
    url: item.link || null,
    image: item.image || null
  };
}

export async function searchWalmart(query) {
  const API_KEY = process.env.WALMART_RAPIDAPI_KEY;
  const walmartSearchUrl = `https://www.walmart.com/search?q=${encodeURIComponent(query)}`;

  const res = await fetch(
    `https://${WALMART_RAPIDAPI_HOST}/walmart-serp.php?url=${encodeURIComponent(walmartSearchUrl)}`,
    {
      headers: buildRapidApiHeaders(API_KEY)
    }
  );

  const data = await res.json();

  return (data.body?.products || [])
    .slice(0, 5)
    .map(normalizeSearchItem)
    .filter((item) => item.name);
}

export async function getWalmartById(id) {
  const API_KEY = process.env.WALMART_RAPIDAPI_KEY;
  const productUrl = `https://www.walmart.com/ip/${id}`;

  const res = await fetch(
    `https://${WALMART_RAPIDAPI_HOST}/product-details.php?url=${encodeURIComponent(productUrl)}`,
    {
      headers: buildRapidApiHeaders(API_KEY)
    }
  );

  const data = await res.json();
  const item = data.body;

  if (!item?.title) throw new Error("Walmart product not found");

  return {
    retailer: "Walmart",
    retailerId: id,
    name: item.title,
    price: parseWalmartPrice(item.price),
    url: productUrl,
    image: item.images?.[0] || null
  };
}
