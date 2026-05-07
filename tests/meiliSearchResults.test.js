import { searchMeiliBestBuyResults } from "../utils/meiliSearchResults.js";

global.fetch = jest.fn();

describe("searchMeiliBestBuyResults", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    fetch.mockReset();
    process.env = {
      ...originalEnv,
      MEILI_HOST: "http://localhost:7700",
      MEILI_MASTER_KEY: "test-key",
      MEILI_BESTBUY_INDEX: "bestbuy_products"
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("maps Meilisearch hits into wishlist search results", async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        hits: [
          {
            sku: "123",
            name: "Bose QuietComfort Ultra Headphones",
            salePrice: 399,
            url: "https://example.com/bose",
            image: "bose.jpg"
          }
        ]
      })
    });

    const results = await searchMeiliBestBuyResults("quietcomfort ultra");

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:7700/indexes/bestbuy_products/search",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key"
        }),
        body: JSON.stringify({
          q: "quietcomfort ultra",
          limit: 10
        })
      })
    );
    expect(results).toEqual([
      {
        title: "Bose QuietComfort Ultra Headphones",
        name: "Bose QuietComfort Ultra Headphones",
        image: "bose.jpg",
        url: "https://example.com/bose",
        sourceInput: "quietcomfort ultra",
        cheapestPrice: 399,
        lowestPrice: 399,
        cheapestRetailer: "BestBuy",
        offers: [
          {
            retailer: "BestBuy",
            retailerId: "123",
            name: "Bose QuietComfort Ultra Headphones",
            price: 399,
            url: "https://example.com/bose",
            image: "bose.jpg"
          }
        ]
      }
    ]);
  });
});
