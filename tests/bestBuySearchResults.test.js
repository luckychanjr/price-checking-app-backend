import { searchBestBuyResults } from "../utils/bestBuySearchResults.js";

global.fetch = jest.fn();

describe("searchBestBuyResults", () => {
  const originalEnv = process.env;
  let apiKeyCounter = 0;

  beforeEach(() => {
    fetch.mockReset();
    fetch.mockImplementation(async () => ({
      json: async () => ({
        products: []
      })
    }));
    apiKeyCounter += 1;
    process.env = {
      ...originalEnv,
      BESTBUY_API_KEY: `test-key-${apiKeyCounter}`,
      BESTBUY_DISABLE_CATEGORY_CACHE: "true"
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("uses the iPad category for iPad searches before mapping results", async () => {
    fetch
      .mockResolvedValueOnce({
        json: async () => ({
          categories: [
            {
              id: "pcmcat209000050007",
              name: "iPad",
              path: [
                { id: "cat00000", name: "Best Buy" },
                { id: "pcmcat209000050006", name: "Tablets" },
                { id: "pcmcat209000050007", name: "iPad" }
              ]
            }
          ]
        })
      })
      .mockResolvedValueOnce({
        json: async () => ({
          products: [
            {
              sku: 123,
              name: "Apple 11-inch iPad Pro M5 chip Wi-Fi 256GB",
              salePrice: 999,
              url: "https://example.com/ipad-pro",
              image: "ipad-pro.jpg",
              department: "Computing",
              class: "Tablets",
              subclass: "iPad"
            }
          ]
        })
      })
      .mockResolvedValueOnce({
        json: async () => ({
          products: []
        })
      });

    const results = await searchBestBuyResults("ipad pro");

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("categoryPath.id=pcmcat209000050007"),
      expect.any(Object)
    );
    expect(results).toEqual([
      {
        title: "Apple 11-inch iPad Pro M5 chip Wi-Fi 256GB",
        name: "Apple 11-inch iPad Pro M5 chip Wi-Fi 256GB",
        image: "ipad-pro.jpg",
        url: "https://example.com/ipad-pro",
        sourceInput: "ipad pro",
        cheapestPrice: 999,
        lowestPrice: 999,
        cheapestRetailer: "BestBuy",
        offers: [
          {
            retailer: "BestBuy",
            retailerId: 123,
            name: "Apple 11-inch iPad Pro M5 chip Wi-Fi 256GB",
            price: 999,
            url: "https://example.com/ipad-pro",
            image: "ipad-pro.jpg"
          }
        ]
      }
    ]);
  });

  it("uses curated category hints before unscoped Best Buy search", async () => {
    fetch.mockImplementation(async (url) => ({
      json: async () => ({
        products: url.includes("categoryPath.id=")
          ? []
          : [
              {
                sku: 456,
                name: "Apple iPad Pro fallback result",
                salePrice: 899,
                url: "https://example.com/fallback",
                image: "fallback.jpg"
              }
            ]
      })
    }));

    const results = await searchBestBuyResults("ipad pro");

    expect(fetch.mock.calls[0][0]).toContain("name=%22ipad*pro*%22");
    expect(fetch.mock.calls[0][0]).toContain("categoryPath.id=pcmcat1478822288810");
    expect(fetch.mock.calls.some(call => !call[0].includes("categoryPath.id="))).toBe(true);
    expect(results[0].name).toBe("Apple iPad Pro fallback result");
  });

  it("keeps category and raw results without taxonomy grouping", async () => {
    fetch
      .mockResolvedValueOnce({
        json: async () => ({
          categories: [
            {
              id: "pcmcat209000050007",
              name: "iPad",
              path: [
                { id: "cat00000", name: "Best Buy" },
                { id: "pcmcat209000050006", name: "Tablets" },
                { id: "pcmcat209000050007", name: "iPad" }
              ]
            }
          ]
        })
      })
      .mockResolvedValueOnce({
        json: async () => ({
          products: [
            {
              sku: 1,
              name: "ZAGG Glass for Apple iPad Pro",
              salePrice: 49.99,
              url: "https://example.com/glass",
              image: "glass.jpg",
              department: "Mobile Accessories",
              class: "Tablet Accessories",
              subclass: "Screen Protectors",
              categoryPath: [
                { id: "accessories", name: "Tablet Accessories" },
                { id: "protectors", name: "Screen Protectors" }
              ]
            },
            {
              sku: 2,
              name: "Apple 11-inch iPad Pro M5 chip Wi-Fi 256GB",
              salePrice: 999,
              url: "https://example.com/ipad-pro-11",
              image: "ipad-pro-11.jpg",
              department: "Computing",
              class: "Tablets",
              subclass: "iPad",
              categoryPath: [
                { id: "tablets", name: "Tablets" },
                { id: "ipad", name: "iPad" }
              ]
            },
            {
              sku: 3,
              name: "Apple 13-inch iPad Pro M5 chip Wi-Fi 512GB",
              salePrice: 1299,
              url: "https://example.com/ipad-pro-13",
              image: "ipad-pro-13.jpg",
              department: "Computing",
              class: "Tablets",
              subclass: "iPad",
              categoryPath: [
                { id: "tablets", name: "Tablets" },
                { id: "ipad", name: "iPad" }
              ]
            }
          ]
        })
      })
      .mockResolvedValueOnce({
        json: async () => ({
          products: []
        })
      });

    const results = await searchBestBuyResults("ipad pro");

    expect(results.map(result => result.name)).toEqual([
      "ZAGG Glass for Apple iPad Pro",
      "Apple 11-inch iPad Pro M5 chip Wi-Fi 256GB",
      "Apple 13-inch iPad Pro M5 chip Wi-Fi 512GB"
    ]);
  });

  it("merges category and raw search results without stopping at the first category", async () => {
    fetch.mockImplementation(async (url) => {
      if (url.includes("categories(")) {
        return {
          json: async () => ({
            categories: url.includes("galaxy%20tab")
              ? [
                  {
                    id: "accessories",
                    name: "Samsung Galaxy Tab Accessories",
                    path: [
                      { id: "cat00000", name: "Best Buy" },
                      { id: "accessories", name: "Samsung Galaxy Tab Accessories" }
                    ]
                  }
                ]
              : []
          })
        };
      }

      if (url.includes("categoryPath.id=pcmcat1690376289838")) {
        return {
          json: async () => ({
            products: [
              {
                sku: 11,
                name: "Samsung Galaxy Tab S11 Book Cover",
                salePrice: 64.99,
                url: "https://example.com/book-cover",
                image: "cover.jpg",
                department: "Mobile Accessories",
                class: "Tablet Accessories",
                subclass: "Cases",
                categoryPath: [
                  { id: "accessories", name: "Tablet Accessories" },
                  { id: "cases", name: "Cases" }
                ]
              }
            ]
          })
        };
      }

      return {
        json: async () => ({
          products: [
            {
              sku: 22,
              name: "Samsung Galaxy Tab S11 11-inch 128GB",
              salePrice: 799,
              url: "https://example.com/galaxy-tab-s11",
              image: "tablet.jpg",
              department: "Computing",
              class: "Tablets",
              subclass: "Android Tablets",
              categoryPath: [
                { id: "tablets", name: "Tablets" },
                { id: "android", name: "Android Tablets" }
              ]
            },
            {
              sku: 23,
              name: "Samsung Galaxy Tab S11 Ultra 256GB",
              salePrice: 1199,
              url: "https://example.com/galaxy-tab-s11-ultra",
              image: "tablet-ultra.jpg",
              department: "Computing",
              class: "Tablets",
              subclass: "Android Tablets",
              categoryPath: [
                { id: "tablets", name: "Tablets" },
                { id: "android", name: "Android Tablets" }
              ]
            }
          ]
        })
      };
    });

    const results = await searchBestBuyResults("samsung galaxy tab");

    expect(results.map(result => result.name)).toEqual([
      "Samsung Galaxy Tab S11 Book Cover",
      "Samsung Galaxy Tab S11 11-inch 128GB",
      "Samsung Galaxy Tab S11 Ultra 256GB"
    ]);
  });

  it("tries relaxed query variants after strict search returns no products", async () => {
    fetch.mockImplementation(async (url) => {
      if (url.includes("categories(")) {
        return {
          json: async () => ({ categories: [] })
        };
      }

      if (url.includes("search=mortal&search=kombat&search=1")) {
        return {
          json: async () => ({ products: [] })
        };
      }

      if (url.includes("search=mortal&search=kombat")) {
        return {
          json: async () => ({
            products: [
              {
                sku: 999,
                name: "Mortal Kombat 1 Standard Edition - PlayStation 5",
                salePrice: 19.99,
                url: "https://example.com/mortal-kombat-1",
                image: "mk1.jpg"
              }
            ]
          })
        };
      }

      return {
        json: async () => ({ products: [] })
      };
    });

    const results = await searchBestBuyResults("mortal kombat 1");

    expect(results.map(result => result.name)).toEqual([
      "Mortal Kombat 1 Standard Edition - PlayStation 5"
    ]);
  });
});
