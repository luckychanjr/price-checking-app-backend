export async function searchWalmart(query) {
  const API_KEY = process.env.WALMART_RAPIDAPI_KEY;

  const res = await fetch(
    `https://walmart-api.p.rapidapi.com/search?query=${encodeURIComponent(query)}`,
    {
      headers: {
        "X-RapidAPI-Key": API_KEY,
        "X-RapidAPI-Host": "walmart-api.p.rapidapi.com"
      }
    }
  );

  const data = await res.json();

  return (data.results || []).slice(0, 5).map((item) => ({
    retailer: "Walmart",
    retailerId: item.id,
    name: item.name,
    price: item.price,
    url: item.url,
    image: item.image
  }));
}

export async function getWalmartById(id) {
  const API_KEY = process.env.WALMART_RAPIDAPI_KEY;

  const res = await fetch(
    `https://walmart-api.p.rapidapi.com/search?query=${id}`,
    {
      headers: {
        "X-RapidAPI-Key": API_KEY,
        "X-RapidAPI-Host": "walmart-api.p.rapidapi.com"
      }
    }
  );

  const data = await res.json();

  const item = (data.results || [])[0];

  if (!item) throw new Error("Walmart product not found");

  return {
    retailer: "Walmart",
    retailerId: item.id,
    name: item.name,
    price: item.price,
    url: item.url,
    image: item.image
  };
}