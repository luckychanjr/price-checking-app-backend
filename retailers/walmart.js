export async function searchBestBuy(query) {
  const API_KEY = process.env.BESTBUY_API_KEY;

  const url = `https://api.bestbuy.com/v1/products((search=${encodeURIComponent(query)}))?apiKey=${API_KEY}&format=json&pageSize=5`;

  const res = await fetch(url);
  const data = await res.json();

  if (!data.products) return [];

  return data.products.map((p) => ({
    retailer: "BestBuy",
    retailerId: p.sku,
    name: p.name,
    price: p.salePrice,
    url: p.url,
    image: p.image
  }));
}

export async function getBestBuyById(sku) {
  const API_KEY = process.env.BESTBUY_API_KEY;

  const url = `https://api.bestbuy.com/v1/products(sku=${sku})?apiKey=${API_KEY}&format=json`;

  const res = await fetch(url);
  const data = await res.json();

  const p = data.products?.[0];

  if (!p) throw new Error("Best Buy product not found");

  return {
    retailer: "BestBuy",
    retailerId: p.sku,
    name: p.name,
    price: p.salePrice,
    url: p.url,
    image: p.image
  };
}