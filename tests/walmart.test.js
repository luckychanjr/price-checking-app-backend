import { getWalmartById, searchWalmart } from "../retailers/walmart.js";

global.fetch = jest.fn();

describe("Walmart retailer adapter", () => {
  beforeEach(() => {
    fetch.mockReset();
    process.env.WALMART_RAPIDAPI_KEY = "test-key";
  });

  it("searchWalmart returns normalized Walmart products and uses RapidAPI headers", async () => {
    fetch.mockResolvedValue({
      json: async () => ({
        results: [
          {
            id: "abc",
            name: "Walmart Laptop",
            price: 899,
            url: "https://walmart.com/item",
            image: "img.jpg"
          }
        ]
      })
    });

    const results = await searchWalmart("laptop");

    expect(fetch).toHaveBeenCalledWith(
      "https://walmart-api.p.rapidapi.com/search?query=laptop",
      {
        headers: {
          "X-RapidAPI-Key": "test-key",
          "X-RapidAPI-Host": "walmart-api.p.rapidapi.com"
        }
      }
    );
    expect(results).toEqual([
      {
        retailer: "Walmart",
        retailerId: "abc",
        name: "Walmart Laptop",
        price: 899,
        url: "https://walmart.com/item",
        image: "img.jpg"
      }
    ]);
  });

  it("searchWalmart limits results to five items", async () => {
    fetch.mockResolvedValue({
      json: async () => ({
        results: Array.from({ length: 7 }, (_, index) => ({
          id: `id-${index}`,
          name: `Item ${index}`,
          price: index + 10,
          url: `https://walmart.com/item-${index}`,
          image: `img-${index}.jpg`
        }))
      })
    });

    const results = await searchWalmart("monitor");

    expect(results).toHaveLength(5);
    expect(results[4].retailerId).toBe("id-4");
  });

  it("getWalmartById returns the first normalized result", async () => {
    fetch.mockResolvedValue({
      json: async () => ({
        results: [
          {
            id: "w-123",
            name: "Walmart Tablet",
            price: 299,
            url: "https://walmart.com/tablet",
            image: "tablet.jpg"
          }
        ]
      })
    });

    const result = await getWalmartById("w-123");

    expect(fetch).toHaveBeenCalledWith(
      "https://walmart-api.p.rapidapi.com/search?query=w-123",
      {
        headers: {
          "X-RapidAPI-Key": "test-key",
          "X-RapidAPI-Host": "walmart-api.p.rapidapi.com"
        }
      }
    );
    expect(result).toEqual({
      retailer: "Walmart",
      retailerId: "w-123",
      name: "Walmart Tablet",
      price: 299,
      url: "https://walmart.com/tablet",
      image: "tablet.jpg"
    });
  });

  it("getWalmartById throws when Walmart returns no results", async () => {
    fetch.mockResolvedValue({
      json: async () => ({
        results: []
      })
    });

    await expect(getWalmartById("missing")).rejects.toThrow("Walmart product not found");
  });
});
