import { searchBestBuy } from "../retailers/bestbuy.js";

global.fetch = jest.fn();

describe("searchBestBuy", () => {
  beforeEach(() => {
    fetch.mockReset();
  });

  it("returns normalized products", async () => {
    // Mock API response
    fetch.mockResolvedValue({
      json: async () => ({
        products: [
          {
            sku: 123,
            name: "Test Laptop",
            salePrice: 999,
            url: "https://example.com",
            image: "img.jpg"
          }
        ]
      })
    });

    const results = await searchBestBuy("laptop");

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("pageSize=50"),
      expect.any(Object)
    );
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("show=sku,name,salePrice,url,image"),
      expect.any(Object)
    );
    expect(results.length).toBe(1);
    expect(results[0]).toEqual({
      retailer: "BestBuy",
      retailerId: 123,
      name: "Test Laptop",
      price: 999,
      url: "https://example.com",
      image: "img.jpg"
    });
  });

  it("returns empty array when no products found", async () => {
    fetch.mockResolvedValue({
      json: async () => ({ products: [] })
    });

    const results = await searchBestBuy("random");
    expect(results).toEqual([]);
  });

  it("filters AppleCare and protection results from normal product searches", async () => {
    fetch.mockResolvedValue({
      json: async () => ({
        products: [
          {
            sku: 456,
            name: "AppleCare+ for 11-inch iPad Pro",
            salePrice: 79,
            url: "https://example.com/applecare",
            image: "applecare.jpg"
          },
          {
            sku: 789,
            name: "Apple iPad Pro 11-inch 256GB Wi-Fi",
            salePrice: 999,
            url: "https://example.com/ipad-pro",
            image: "ipad-pro.jpg"
          }
        ]
      })
    });

    const results = await searchBestBuy("ipad pro");

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("products(search=ipad&search=pro)"),
      expect.any(Object)
    );
    expect(results).toEqual([
      {
        retailer: "BestBuy",
        retailerId: 789,
        name: "Apple iPad Pro 11-inch 256GB Wi-Fi",
        price: 999,
        url: "https://example.com/ipad-pro",
        image: "ipad-pro.jpg"
      }
    ]);
  });

  it("filters tablet stands from normal iPad searches", async () => {
    fetch.mockResolvedValue({
      json: async () => ({
        products: [
          {
            sku: 456,
            name: "Satechi R1 Aluminum Multi-Angle Foldable Tablet Stand Compatible with iPad Air",
            salePrice: 39.99,
            url: "https://example.com/stand",
            image: "stand.jpg"
          },
          {
            sku: 789,
            name: "Apple 11-inch iPad Air M4 chip Wi-Fi 128GB",
            salePrice: 559,
            url: "https://example.com/ipad-air",
            image: "ipad-air.jpg"
          }
        ]
      })
    });

    const results = await searchBestBuy("ipad air");

    expect(results).toEqual([
      {
        retailer: "BestBuy",
        retailerId: 789,
        name: "Apple 11-inch iPad Air M4 chip Wi-Fi 128GB",
        price: 559,
        url: "https://example.com/ipad-air",
        image: "ipad-air.jpg"
      }
    ]);
  });

  it("filters screen glass and installation services from normal iPad Pro searches", async () => {
    fetch.mockResolvedValue({
      json: async () => ({
        products: [
          {
            sku: 456,
            name: "ZAGG Glass XTR3 Apple iPad Pro 11-inch Clear",
            salePrice: 49.99,
            url: "https://example.com/glass",
            image: "glass.jpg"
          },
          {
            sku: 457,
            name: "Tablet Shield Installation",
            salePrice: 14.99,
            url: "https://example.com/install",
            image: "install.jpg"
          },
          {
            sku: 789,
            name: "Apple 11-inch iPad Pro M4 Wi-Fi 256GB",
            salePrice: 999,
            url: "https://example.com/ipad-pro",
            image: "ipad-pro.jpg"
          }
        ]
      })
    });

    const results = await searchBestBuy("ipad pro");

    expect(results).toEqual([
      {
        retailer: "BestBuy",
        retailerId: 789,
        name: "Apple 11-inch iPad Pro M4 Wi-Fi 256GB",
        price: 999,
        url: "https://example.com/ipad-pro",
        image: "ipad-pro.jpg"
      }
    ]);
  });

  it("keeps AppleCare results when the search is explicitly for AppleCare", async () => {
    fetch.mockResolvedValue({
      json: async () => ({
        products: [
          {
            sku: 456,
            name: "AppleCare+ for 11-inch iPad Pro",
            salePrice: 79,
            url: "https://example.com/applecare",
            image: "applecare.jpg"
          }
        ]
      })
    });

    const results = await searchBestBuy("applecare ipad pro");

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("AppleCare+ for 11-inch iPad Pro");
  });

  it("retries iPad searches with a tablet-focused query when the first results are only accessories", async () => {
    fetch
      .mockResolvedValueOnce({
        json: async () => ({
          products: [
            {
              sku: 456,
              name: "AppleCare+ for 11-inch iPad Pro",
              salePrice: 79,
              url: "https://example.com/applecare",
              image: "applecare.jpg"
            }
          ]
        })
      })
      .mockResolvedValueOnce({
        json: async () => ({
          products: [
            {
              sku: 789,
              name: "Apple iPad Pro 11-inch 256GB Wi-Fi",
              salePrice: 999,
              url: "https://example.com/ipad-pro",
              image: "ipad-pro.jpg"
            }
          ]
        })
      });

    const results = await searchBestBuy("ipad pro");

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenLastCalledWith(
      expect.stringContaining("products(search=ipad&search=pro&search=tablet)"),
      expect.any(Object)
    );
    expect(results).toEqual([
      expect.objectContaining({
        retailerId: 789,
        name: "Apple iPad Pro 11-inch 256GB Wi-Fi"
      })
    ]);
  });
});
