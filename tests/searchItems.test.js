jest.mock("../utils/bestBuySearchResults.js", () => ({
  searchBestBuyResults: jest.fn()
}));

jest.mock("../utils/meiliSearchResults.js", () => ({
  searchMeiliBestBuyResults: jest.fn()
}));

jest.mock("../retailers/walmart.js", () => ({
  searchWalmart: jest.fn()
}));

import { searchBestBuyResults } from "../utils/bestBuySearchResults.js";
import { searchMeiliBestBuyResults } from "../utils/meiliSearchResults.js";
import { searchWalmart } from "../retailers/walmart.js";
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

  it("returns mixed Best Buy and Walmart search results by default", async () => {
    searchBestBuyResults.mockResolvedValue([
      {
        name: "Apple iPad Pro",
        lowestPrice: 999,
        cheapestRetailer: "BestBuy",
        offers: []
      }
    ]);
    searchWalmart.mockResolvedValue([
      {
        retailer: "Walmart",
        retailerId: "w-123",
        name: "Apple iPad Pro - Walmart",
        price: 949,
        url: "https://example.com/walmart-ipad",
        image: "ipad.jpg"
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
          cheapestRetailer: "BestBuy",
          offers: []
        },
        {
          title: "Apple iPad Pro - Walmart",
          name: "Apple iPad Pro - Walmart",
          image: "ipad.jpg",
          url: "https://example.com/walmart-ipad",
          sourceInput: "ipad pro",
          cheapestPrice: 949,
          lowestPrice: 949,
          cheapestRetailer: "Walmart",
          offers: [
            {
              retailer: "Walmart",
              retailerId: "w-123",
              name: "Apple iPad Pro - Walmart",
              price: 949,
              url: "https://example.com/walmart-ipad",
              image: "ipad.jpg"
            }
          ]
        }
      ]
    });
  });

  it("interleaves Best Buy and Walmart results so both retailers appear near the top", async () => {
    searchBestBuyResults.mockResolvedValue([
      {
        name: "Best Buy Result 1",
        lowestPrice: 999,
        cheapestRetailer: "BestBuy",
        offers: []
      },
      {
        name: "Best Buy Result 2",
        lowestPrice: 1099,
        cheapestRetailer: "BestBuy",
        offers: []
      }
    ]);
    searchWalmart.mockResolvedValue([
      {
        retailer: "Walmart",
        retailerId: "w-1",
        name: "Walmart Result 1",
        price: 949,
        url: null,
        image: null
      },
      {
        retailer: "Walmart",
        retailerId: "w-2",
        name: "Walmart Result 2",
        price: 1049,
        url: null,
        image: null
      }
    ]);

    const response = await handler({
      body: JSON.stringify({ query: "ipad pro" })
    });

    expect(JSON.parse(response.body).items.map(item => item.name)).toEqual([
      "Best Buy Result 1",
      "Walmart Result 1",
      "Best Buy Result 2",
      "Walmart Result 2"
    ]);
  });

  it("returns Walmart results when Best Buy returns no results", async () => {
    searchBestBuyResults.mockRejectedValue(
      new Error("No results from Best Buy")
    );
    searchWalmart.mockResolvedValue([
      {
        retailer: "Walmart",
        retailerId: "w-456",
        name: "Samsung Galaxy Tab",
        price: 219,
        url: "https://example.com/tab",
        image: null
      }
    ]);

    const response = await handler({
      body: JSON.stringify({ query: "samsung galaxy tab" })
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).items).toHaveLength(1);
    expect(JSON.parse(response.body).items[0].cheapestRetailer).toBe("Walmart");
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
    expect(searchWalmart).not.toHaveBeenCalled();
    expect(searchMeiliBestBuyResults).toHaveBeenCalledWith("mortal kombat 1", { debug: false });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).items[0].name).toBe("Mortal Kombat 1 Standard Edition");
  });

  it("passes through temporary Best Buy debug output when requested", async () => {
    process.env.SEARCH_PROVIDER = "bestbuy";
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

  it("returns combined debug output when requested", async () => {
    searchBestBuyResults.mockResolvedValue({
      items: [
        {
          name: "Best Buy Galaxy Tab",
          lowestPrice: 249,
          cheapestRetailer: "BestBuy",
          offers: []
        }
      ],
      debug: {
        provider: "bestbuy",
        returnedItemCount: 1
      }
    });
    searchWalmart.mockResolvedValue({
      items: [
        {
          retailer: "Walmart",
          retailerId: "w-789",
          name: "Walmart Galaxy Tab",
          price: 219,
          url: null,
          image: null
        }
      ],
      debug: {
        productArrayCount: 1,
        validItemCount: 1
      }
    });

    const response = await handler({
      body: JSON.stringify({ query: "samsung galaxy tab", debug: true })
    });

    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.items).toHaveLength(2);
    expect(body.debug.provider).toBe("combined");
    expect(body.debug.bestbuy.provider).toBe("bestbuy");
    expect(body.debug.walmart.provider).toBe("walmart");
    expect(body.debug.returnedItemCount).toBe(2);
  });
});
