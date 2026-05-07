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

  it("merges high-confidence cross-retailer matches into one offer group", async () => {
    searchBestBuyResults.mockResolvedValue([
      {
        title: "Apple 11-inch iPad Air M3 Wi-Fi 128GB - Blue",
        name: "Apple 11-inch iPad Air M3 Wi-Fi 128GB - Blue",
        image: "bestbuy-ipad.jpg",
        url: "https://example.com/bestbuy-ipad-air",
        sourceInput: "ipad air",
        cheapestPrice: 599,
        lowestPrice: 599,
        cheapestRetailer: "BestBuy",
        modelNumber: "MC9X4LL/A",
        manufacturer: "Apple",
        offers: [
          {
            retailer: "BestBuy",
            retailerId: 123,
            name: "Apple 11-inch iPad Air M3 Wi-Fi 128GB - Blue",
            price: 599,
            url: "https://example.com/bestbuy-ipad-air",
            image: "bestbuy-ipad.jpg",
            modelNumber: "MC9X4LL/A",
            manufacturer: "Apple"
          }
        ]
      }
    ]);
    searchWalmart.mockResolvedValue([
      {
        retailer: "Walmart",
        retailerId: "w-123",
        name: "2025 Apple 11-inch iPad Air M3 Wi-Fi 128GB Blue",
        price: 549,
        url: "https://example.com/walmart-ipad-air",
        image: "walmart-ipad.jpg"
      }
    ]);

    const response = await handler({
      body: JSON.stringify({ query: "ipad air" })
    });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toEqual(
      expect.objectContaining({
        name: "Apple 11-inch iPad Air M3 Wi-Fi 128GB - Blue",
        lowestPrice: 549,
        cheapestPrice: 549,
        cheapestRetailer: "Walmart"
      })
    );
    expect(body.items[0].offers).toEqual([
      expect.objectContaining({
        retailer: "Walmart",
        price: 549
      }),
      expect.objectContaining({
        retailer: "BestBuy",
        price: 599
      })
    ]);
  });

  it("does not merge cross-retailer results when important product tokens conflict", async () => {
    searchBestBuyResults.mockResolvedValue([
      {
        title: "Apple 11-inch iPad Air M3 Wi-Fi 128GB - Blue",
        name: "Apple 11-inch iPad Air M3 Wi-Fi 128GB - Blue",
        image: "bestbuy-ipad.jpg",
        url: "https://example.com/bestbuy-ipad-air",
        sourceInput: "ipad air",
        cheapestPrice: 599,
        lowestPrice: 599,
        cheapestRetailer: "BestBuy",
        offers: [
          {
            retailer: "BestBuy",
            retailerId: 123,
            name: "Apple 11-inch iPad Air M3 Wi-Fi 128GB - Blue",
            price: 599,
            url: "https://example.com/bestbuy-ipad-air",
            image: "bestbuy-ipad.jpg"
          }
        ]
      }
    ]);
    searchWalmart.mockResolvedValue([
      {
        retailer: "Walmart",
        retailerId: "w-256",
        name: "2025 Apple 11-inch iPad Air M3 Wi-Fi 256GB Blue",
        price: 649,
        url: "https://example.com/walmart-ipad-air-256",
        image: "walmart-ipad.jpg"
      }
    ]);

    const response = await handler({
      body: JSON.stringify({ query: "ipad air" })
    });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.items).toHaveLength(2);
    expect(body.items.map(item => item.name)).toEqual([
      "Apple 11-inch iPad Air M3 Wi-Fi 128GB - Blue",
      "2025 Apple 11-inch iPad Air M3 Wi-Fi 256GB Blue"
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

  it("includes cross-retailer match details in combined debug output", async () => {
    searchBestBuyResults.mockResolvedValue({
      items: [
        {
          name: "Apple 11-inch iPad Air M3 Wi-Fi 128GB - Blue",
          lowestPrice: 599,
          cheapestPrice: 599,
          cheapestRetailer: "BestBuy",
          offers: [
            {
              retailer: "BestBuy",
              name: "Apple 11-inch iPad Air M3 Wi-Fi 128GB - Blue",
              price: 599
            }
          ]
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
          retailerId: "w-123",
          name: "2025 Apple 11-inch iPad Air M3 Wi-Fi 128GB Blue",
          price: 549,
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
      body: JSON.stringify({ query: "ipad air", debug: true })
    });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.debug.crossRetailerMatchCount).toBe(1);
    expect(body.debug.crossRetailerMatches[0]).toEqual(
      expect.objectContaining({
        bestBuyName: "Apple 11-inch iPad Air M3 Wi-Fi 128GB - Blue",
        walmartName: "2025 Apple 11-inch iPad Air M3 Wi-Fi 128GB Blue"
      })
    );
  });
});
