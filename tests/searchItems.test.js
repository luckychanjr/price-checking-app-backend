jest.mock("../utils/bestBuySearchResults.js", () => ({
  searchBestBuyResults: jest.fn()
}));

jest.mock("../utils/meiliSearchResults.js", () => ({
  searchMeiliBestBuyResults: jest.fn()
}));

import { searchBestBuyResults } from "../utils/bestBuySearchResults.js";
import { searchMeiliBestBuyResults } from "../utils/meiliSearchResults.js";
import { handler } from "../functions/searchItems.js";

describe("searchItems handler", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv
    };
    delete process.env.SEARCH_PROVIDER;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns matching products from the Best Buy search utility", async () => {
    searchBestBuyResults.mockResolvedValue([
      {
        name: "Apple iPad Pro",
        lowestPrice: 999,
        offers: []
      }
    ]);

    const response = await handler({
      body: JSON.stringify({ query: "ipad pro" })
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      items: [
        {
          name: "Apple iPad Pro",
          lowestPrice: 999,
          offers: []
        }
      ]
    });
  });

  it("returns an empty result set instead of a server error when Best Buy returns no results", async () => {
    searchBestBuyResults.mockRejectedValue(
      new Error("No results from Best Buy")
    );

    const response = await handler({
      body: JSON.stringify({ query: "ipad pro" })
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ items: [] });
  });

  it("uses Meilisearch when SEARCH_PROVIDER is set to meilisearch", async () => {
    process.env.SEARCH_PROVIDER = "meilisearch";
    searchMeiliBestBuyResults.mockResolvedValue([
      {
        name: "Mortal Kombat 1 Standard Edition",
        lowestPrice: 19.99,
        cheapestRetailer: "BestBuy",
        offers: []
      }
    ]);

    const response = await handler({
      body: JSON.stringify({ query: "mortal kombat 1" })
    });

    expect(searchBestBuyResults).not.toHaveBeenCalled();
    expect(searchMeiliBestBuyResults).toHaveBeenCalledWith("mortal kombat 1", { debug: false });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).items[0].name).toBe("Mortal Kombat 1 Standard Edition");
  });

  it("passes through temporary Best Buy debug output when requested", async () => {
    searchBestBuyResults.mockResolvedValue({
      items: [],
      debug: {
        provider: "bestbuy",
        input: "samsung galaxy tab",
        categoryIds: [],
        queryVariants: ["samsung galaxy tab"],
        callCount: 1,
        rawProductCount: 0,
        dedupedProductCount: 0,
        returnedItemCount: 0,
        calls: []
      }
    });

    const response = await handler({
      body: JSON.stringify({ query: "samsung galaxy tab", debug: true })
    });

    expect(searchBestBuyResults).toHaveBeenCalledWith("samsung galaxy tab", { debug: true });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      items: [],
      debug: {
        provider: "bestbuy",
        input: "samsung galaxy tab",
        categoryIds: [],
        queryVariants: ["samsung galaxy tab"],
        callCount: 1,
        rawProductCount: 0,
        dedupedProductCount: 0,
        returnedItemCount: 0,
        calls: []
      }
    });
  });
});
