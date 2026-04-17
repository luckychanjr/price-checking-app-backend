export async function searchBestBuy(query) {
  const API_KEY = process.env.BESTBUY_API_KEY;

  const url = `https://api.bestbuy.com/v1/products((search=${encodeURIComponent(query)}))?apiKey=${API_KEY}&format=json&pageSize=5`;

  const res = await fetch(url);
  const data = await res.json();

  if (!data.products || data.products.length === 0) {
    throw new Error("No Best Buy results found");
  }

  // Normalize results
  return data.products.map((product) => ({
    retailer: "BestBuy",
    retailerId: product.sku,
    name: product.name,
    price: product.salePrice,
    url: product.url,
    image: product.image
  }));
}

export async function searchWalmart(query) { 
  const API_KEY = process.env.BESTBUY_API_KEY;

  const url = `https://api.bestbuy.com/v1/products((search=${encodeURIComponent(query)}))?apiKey=${API_KEY}&format=json&pageSize=5`;

  const res = await fetch(url);
  const data = await res.json();

  if (!data.products || data.products.length === 0) {
    throw new Error("No Best Buy results found");
  }

  // Normalize results
  return data.products.map((product) => ({
    retailer: "BestBuy",
    retailerId: product.sku,
    name: product.name,
    price: product.salePrice,
    url: product.url,
    image: product.image
  }));
}