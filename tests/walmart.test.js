import { getWalmartById, getWalmartByUrl, searchWalmart } from "../retailers/walmart.js";

global.fetch = jest.fn();

describe("Walmart retailer adapter", () => {
  beforeEach(() => {
    fetch.mockReset();
    process.env.WALMART_RAPIDAPI_KEY = "test-key";
  });

  it("searchWalmart returns normalized Walmart products and uses RapidAPI headers", async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        body: {
          products: [
            {
              title: "Walmart Laptop",
              price: {
                currentPrice: "$899.00"
              },
              link: "https://www.walmart.com/ip/abc",
              image: "img.jpg"
            }
          ]
        }
      })
    });

    const results = await searchWalmart("laptop");

    expect(fetch).toHaveBeenCalledWith(
      "https://walmart-api4.p.rapidapi.com/search?q=laptop&page=1",
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json",
          "x-rapidapi-host": "walmart-api4.p.rapidapi.com",
          "x-rapidapi-key": "test-key"
        },
        signal: expect.anything()
      })
    );
    expect(results).toEqual([
      {
        retailer: "Walmart",
        retailerId: "abc",
        name: "Walmart Laptop",
        price: 899,
        url: "https://www.walmart.com/ip/abc",
        image: "img.jpg"
      }
    ]);
  });

  it("searchWalmart accepts direct search endpoint product fields", async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        products: [
          {
            productId: "12345",
            name: "Apple iPad Pro 11-inch 256GB",
            price: "$999.00",
            url: "https://www.walmart.com/ip/ipad-pro/12345",
            thumbnail: "ipad.jpg"
          }
        ]
      })
    });

    const results = await searchWalmart("ipad pro");

    expect(results).toEqual([
      {
        retailer: "Walmart",
        retailerId: "12345",
        name: "Apple iPad Pro 11-inch 256GB",
        price: 999,
        url: "https://www.walmart.com/ip/ipad-pro/12345",
        image: "ipad.jpg"
      }
    ]);
  });

  it("searchWalmart tolerates Walmart item stack response shapes", async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        searchResult: {
          itemStacks: [
            {
              items: [
                {
                  usItemId: "67890",
                  name: "Apple iPad Pro 13-inch",
                  price: {
                    price: 1299
                  },
                  canonicalUrl: "https://www.walmart.com/ip/ipad-pro/67890",
                  imageUrl: "ipad-13.jpg"
                }
              ]
            }
          ]
        }
      })
    });

    const results = await searchWalmart("ipad pro");

    expect(results).toEqual([
      expect.objectContaining({
        retailerId: "67890",
        name: "Apple iPad Pro 13-inch",
        price: 1299
      })
    ]);
  });

  it("searchWalmart flattens nested RapidAPI searchResult arrays", async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        searchTerms: "samsung galaxy tab",
        aggregatedCount: 1307,
        searchResult: [
          [
            {
              usItemId: "111",
              name: "Samsung Galaxy Tab A9+ 11-inch Tablet",
              price: {
                price: "$219.00"
              },
              canonicalUrl: "https://www.walmart.com/ip/galaxy-tab/111",
              imageUrl: "tab.jpg"
            }
          ],
          [],
          [
            {
              usItemId: "222",
              name: "Samsung Galaxy Tab S10 Ultra",
              currentPrice: "$999.00",
              canonicalUrl: "https://www.walmart.com/ip/galaxy-tab-ultra/222"
            }
          ]
        ]
      })
    });

    const results = await searchWalmart("samsung galaxy tab");

    expect(results).toEqual([
      expect.objectContaining({
        retailerId: "111",
        name: "Samsung Galaxy Tab A9+ 11-inch Tablet",
        price: 219
      }),
      expect.objectContaining({
        retailerId: "222",
        name: "Samsung Galaxy Tab S10 Ultra",
        price: 999
      })
    ]);
  });

  it("exposes Walmart identifier fields in debug samples and normalized products", async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        searchResult: {
          itemStacks: [
            {
              items: [
                {
                  itemId: "item-111",
                  usItemId: "111",
                  upc: "887276778801",
                  gtin: "00887276778801",
                  ean: "0887276778801",
                  modelNumber: "SM-X210NZAAXAR",
                  brand: "Samsung",
                  manufacturer: "Samsung Electronics",
                  name: "Samsung Galaxy Tab A9+ 11-inch Tablet",
                  price: {
                    price: "$219.00"
                  },
                  canonicalUrl: "https://www.walmart.com/ip/galaxy-tab/111",
                  imageUrl: "tab.jpg"
                }
              ]
            }
          ]
        }
      })
    });

    const response = await searchWalmart("samsung galaxy tab", { debug: true });

    expect(response.items[0]).toEqual(
      expect.objectContaining({
        upc: "887276778801",
        gtin: "00887276778801",
        ean: "0887276778801",
        modelNumber: "SM-X210NZAAXAR",
        brand: "Samsung",
        manufacturer: "Samsung Electronics",
        itemId: "item-111",
        usItemId: "111"
      })
    );
    expect(response.debug.sampleRawProducts[0]).toEqual(
      expect.objectContaining({
        upc: "887276778801",
        gtin: "00887276778801",
        ean: "0887276778801",
        modelNumber: "SM-X210NZAAXAR",
        brand: "Samsung",
        manufacturer: "Samsung Electronics",
        itemId: "item-111",
        usItemId: "111"
      })
    );
  });

  it("deep-scans raw Walmart debug payloads for nested identifier-like fields", async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          searchResult: {
            itemStacks: [
              {
                items: [
                  {
                    name: "Apple iPad Air",
                    price: "$599.00",
                    canonicalUrl: "https://www.walmart.com/ip/ipad-air/123",
                    productIdentifiers: {
                      gtin: "00195949728426"
                    },
                    specifications: [
                      {
                        name: "Model",
                        value: "MC9X4LL/A"
                      }
                    ]
                  }
                ]
              }
            ]
          }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          body: {}
        })
      });

    const response = await searchWalmart("ipad air", { debug: true });

    expect(response.debug.identifierFieldMatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "$.searchResult.itemStacks[0].items[0].productIdentifiers",
          key: "productIdentifiers",
          type: "object"
        }),
        expect.objectContaining({
          path: "$.searchResult.itemStacks[0].items[0].productIdentifiers.gtin",
          key: "gtin",
          value: "00195949728426"
        }),
        expect.objectContaining({
          path: "$.searchResult.itemStacks[0].items[0].specifications",
          key: "specifications",
          type: "array"
        })
      ])
    );
  });

  it("does not treat specialBuy as a debug specification match", async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          searchResult: [
            [
              {
                name: "Apple iPad Air",
                price: "$599.00",
                canonicalUrl: "https://www.walmart.com/ip/ipad-air/123",
                specialBuy: false
              }
            ]
          ]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          body: {}
        })
      });

    const response = await searchWalmart("ipad air", { debug: true });

    expect(response.debug.identifierFieldMatches).toEqual([]);
  });

  it("deep-scans product details for identifier-like fields during debug searches", async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          searchResult: [
            [
              {
                name: "Apple iPad Air",
                price: "$599.00",
                canonicalUrl: "https://www.walmart.com/ip/ipad-air/123"
              }
            ]
          ]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          body: {
            product: {
              identifiers: {
                upc: "195949728426",
                gtin: "00195949728426"
              },
              specifications: [
                {
                  name: "Model",
                  value: "MC9X4LL/A"
                }
              ]
            }
          }
        })
      });

    const response = await searchWalmart("ipad air", { debug: true });

    expect(fetch).toHaveBeenLastCalledWith(
      "https://walmart-api4.p.rapidapi.com/product-details.php?url=https%3A%2F%2Fwww.walmart.com%2Fip%2Fipad-air%2F123",
      expect.any(Object)
    );
    expect(response.debug.productDetailScannedCount).toBe(1);
    expect(response.debug.productDetailFieldMatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: "https://www.walmart.com/ip/ipad-air/123",
          path: "$.body.product.identifiers",
          key: "identifiers",
          type: "object"
        }),
        expect.objectContaining({
          url: "https://www.walmart.com/ip/ipad-air/123",
          path: "$.body.product.identifiers.upc",
          key: "upc",
          value: "195949728426"
        }),
        expect.objectContaining({
          url: "https://www.walmart.com/ip/ipad-air/123",
          path: "$.body.product.identifiers.gtin",
          key: "gtin",
          value: "00195949728426"
        }),
        expect.objectContaining({
          url: "https://www.walmart.com/ip/ipad-air/123",
          path: "$.body.product.specifications",
          key: "specifications",
          type: "array"
        })
      ])
    );
  });

  it("keeps product detail debug failures from failing Walmart search", async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          searchResult: [
            [
              {
                name: "Apple iPad Air",
                price: "$599.00",
                canonicalUrl: "https://www.walmart.com/ip/ipad-air/123"
              }
            ]
          ]
        })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ message: "Rate limited" })
      });

    const response = await searchWalmart("ipad air", { debug: true });

    expect(response.items).toHaveLength(1);
    expect(response.debug.productDetailScans[0]).toEqual(
      expect.objectContaining({
        url: "https://www.walmart.com/ip/ipad-air/123",
        error: "Walmart product details debug request failed with 429: Rate limited"
      })
    );
  });

  it("limits product detail debug scans to the first three unique URLs", async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          body: {
            products: Array.from({ length: 5 }, (_, index) => ({
              title: `Item ${index}`,
              price: "$10.00",
              link: `https://www.walmart.com/ip/item-${index}`
            }))
          }
        })
      })
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          body: {}
        })
      });

    const response = await searchWalmart("ipad air", { debug: true });

    expect(response.debug.productDetailScanLimit).toBe(3);
    expect(response.debug.productDetailScannedCount).toBe(3);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("deep-scans item stack product details for nested identifier-like fields", async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        searchResult: {
          itemStacks: [
            {
              items: [
                {
                  name: "Apple iPad Air",
                  price: "$599.00",
                  canonicalUrl: "https://www.walmart.com/ip/ipad-air/123",
                  productIdentifiers: {
                    gtin: "00195949728426"
                  },
                  specifications: [
                    {
                      name: "Model",
                      value: "MC9X4LL/A"
                    }
                  ]
                }
              ]
            }
          ]
        }
      })
    });

    const response = await searchWalmart("ipad air", { debug: true });

    expect(response.debug.identifierFieldMatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "$.searchResult.itemStacks[0].items[0].productIdentifiers",
          key: "productIdentifiers",
          type: "object"
        }),
        expect.objectContaining({
          path: "$.searchResult.itemStacks[0].items[0].productIdentifiers.gtin",
          key: "gtin",
          value: "00195949728426"
        }),
        expect.objectContaining({
          path: "$.searchResult.itemStacks[0].items[0].specifications",
          key: "specifications",
          type: "array"
        })
      ])
    );
  });

  it("searchWalmart limits results to twenty items", async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        body: {
          products: Array.from({ length: 25 }, (_, index) => ({
            title: `Item ${index}`,
            price: {
              currentPrice: `$${index + 10}.00`
            },
            link: `https://www.walmart.com/ip/id-${index}`,
            image: `img-${index}.jpg`
          }))
        }
      })
    });

    const results = await searchWalmart("monitor");

    expect(results).toHaveLength(20);
    expect(results[19].retailerId).toBe("id-19");
  });

  it("searchWalmart encodes multi-word queries once", async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        body: {
          products: []
        }
      })
    });

    await searchWalmart("ipad air");

    expect(fetch).toHaveBeenCalledWith(
      "https://walmart-api4.p.rapidapi.com/search?q=ipad%20air&page=1",
      expect.any(Object)
    );
  });

  it("searchWalmart encodes multi-word queries like the working RapidAPI curl", async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        body: {
          products: []
        }
      })
    });

    await searchWalmart("ipad pro");

    expect(fetch).toHaveBeenCalledWith(
      "https://walmart-api4.p.rapidapi.com/search?q=ipad%20pro&page=1",
      expect.any(Object)
    );
  });

  it("getWalmartById returns the first normalized result", async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        body: {
          title: "Walmart Tablet",
          price: "$299.00",
          images: ["tablet.jpg"]
        }
      })
    });

    const result = await getWalmartById("w-123");

    expect(fetch).toHaveBeenCalledWith(
      "https://walmart-api4.p.rapidapi.com/product-details.php?url=https%3A%2F%2Fwww.walmart.com%2Fip%2Fw-123",
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json",
          "x-rapidapi-host": "walmart-api4.p.rapidapi.com",
          "x-rapidapi-key": "test-key"
        },
        signal: expect.anything()
      })
    );
    expect(result).toEqual({
      retailer: "Walmart",
      retailerId: "w-123",
      name: "Walmart Tablet",
      price: 299,
      url: "https://www.walmart.com/ip/w-123",
      image: "tablet.jpg"
    });
  });

  it("getWalmartByUrl preserves the canonical Walmart URL when looking up product details", async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        body: {
          title: "2026 11-inch iPad Air M4 Wi-Fi 128GB Purple",
          price: "$599.00",
          images: ["ipad-air.jpg"]
        }
      })
    });

    const productUrl =
      "https://www.walmart.com/ip/2026-11-inch-iPad-Air-M4-Wi-Fi-128GB-Purple/19659462511";
    const result = await getWalmartByUrl(productUrl);

    expect(fetch).toHaveBeenCalledWith(
      `https://walmart-api4.p.rapidapi.com/product-details.php?url=${encodeURIComponent(productUrl)}`,
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json",
          "x-rapidapi-host": "walmart-api4.p.rapidapi.com",
          "x-rapidapi-key": "test-key"
        },
        signal: expect.anything()
      })
    );
    expect(result).toEqual({
      retailer: "Walmart",
      retailerId: "19659462511",
      name: "2026 11-inch iPad Air M4 Wi-Fi 128GB Purple",
      price: 599,
      url: productUrl,
      image: "ipad-air.jpg"
    });
  });

  it("getWalmartById throws when Walmart returns no results", async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        body: {}
      })
    });

    await expect(getWalmartById("missing")).rejects.toThrow("Walmart product not found");
  });

  it("throws a useful error when the Walmart API key is missing", async () => {
    delete process.env.WALMART_RAPIDAPI_KEY;

    await expect(searchWalmart("laptop")).rejects.toThrow(
      "Missing required environment variable: WALMART_RAPIDAPI_KEY"
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("throws a useful error when Walmart search fails", async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ message: "Invalid RapidAPI key" })
    });

    await expect(searchWalmart("laptop")).rejects.toThrow(
      "Walmart search request failed with 401: Invalid RapidAPI key"
    );
  });
});
