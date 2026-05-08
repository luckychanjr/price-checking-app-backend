jest.mock("../retailers/bestbuy.js", () => ({
  searchBestBuy: jest.fn()
}));

jest.mock("../retailers/walmart.js", () => ({
  searchWalmart: jest.fn()
}));

import { searchBestBuy } from "../retailers/bestbuy.js";
import { searchWalmart } from "../retailers/walmart.js";
import {
  getProductAcrossRetailers,
  searchProductsAcrossRetailers
} from "../utils/productService.js";

describe("productService aggregation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns retailer search matches as separate product cards", async () => {
    searchBestBuy.mockResolvedValue([
      {
        retailer: "BestBuy",
        retailerId: "bb-1",
        name: "Apple iPad Air M3 11-inch 128GB",
        price: 599,
        url: "https://bestbuy.com/ipad-air",
        image: "bestbuy.jpg"
      }
    ]);

    searchWalmart.mockResolvedValue([
      {
        retailer: "Walmart",
        retailerId: "wm-1",
        name: "Apple iPad Air M3 11 inch 128GB",
        price: 579,
        url: "https://walmart.com/ipad-air",
        image: "walmart.jpg"
      }
    ]);

    const results = await searchProductsAcrossRetailers("ipad air");

    expect(results).toHaveLength(2);
    expect(results.map((result) => result.cheapestRetailer)).toEqual([
      "BestBuy",
      "Walmart"
    ]);
    expect(results.every((result) => result.offers.length === 1)).toBe(true);
  });

  it("filters cheap accessories when searching for the main product", async () => {
    searchBestBuy.mockResolvedValue([
      {
        retailer: "BestBuy",
        retailerId: "bb-care",
        name: "AppleCare+ for 11-inch iPad Pro",
        price: 79,
        url: "https://bestbuy.com/applecare",
        image: "applecare.jpg"
      },
      {
        retailer: "BestBuy",
        retailerId: "bb-ipad",
        name: "Apple iPad Pro 11-inch 256GB Wi-Fi",
        price: 999,
        url: "https://bestbuy.com/ipad-pro",
        image: "ipad-pro.jpg"
      }
    ]);
    searchWalmart.mockResolvedValue([]);

    const [result] = await searchProductsAcrossRetailers("Apple iPad Pro 11-inch 256GB");

    expect(result.name).toBe("Apple iPad Pro 11-inch 256GB Wi-Fi");
    expect(result.url).toBe("https://bestbuy.com/ipad-pro");
    expect(result.lowestPrice).toBe(999);
    expect(result.cheapestRetailer).toBe("BestBuy");
    expect(result.offers).toEqual([
      expect.objectContaining({
        retailerId: "bb-ipad"
      })
    ]);
  });

  it("filters tablet stands and compatibility accessories from iPad searches", async () => {
    searchBestBuy.mockResolvedValue([
      {
        retailer: "BestBuy",
        retailerId: "bb-stand",
        name: "Satechi R1 Foldable Tablet Stand Compatible with iPad Air",
        price: 39.99,
        url: "https://bestbuy.com/tablet-stand",
        image: "stand.jpg"
      },
      {
        retailer: "BestBuy",
        retailerId: "bb-ipad-air",
        name: "Apple 11-inch iPad Air M4 chip Wi-Fi 128GB Blue",
        price: 559,
        url: "https://bestbuy.com/ipad-air",
        image: "ipad-air.jpg"
      }
    ]);
    searchWalmart.mockResolvedValue([]);

    const results = await searchProductsAcrossRetailers("ipad air");

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(
      expect.objectContaining({
        name: "Apple 11-inch iPad Air M4 chip Wi-Fi 128GB Blue",
        cheapestRetailer: "BestBuy"
      })
    );
  });

  it("filters screen glass and installation services from iPad Pro searches", async () => {
    searchBestBuy.mockResolvedValue([
      {
        retailer: "BestBuy",
        retailerId: "bb-glass",
        name: "ZAGG Glass XTR3 Apple iPad Pro 11-inch Clear",
        price: 49.99,
        url: "https://bestbuy.com/ipad-pro-glass",
        image: "glass.jpg"
      },
      {
        retailer: "BestBuy",
        retailerId: "bb-install",
        name: "Tablet Shield Installation",
        price: 14.99,
        url: "https://bestbuy.com/tablet-shield-installation",
        image: "installation.jpg"
      },
      {
        retailer: "BestBuy",
        retailerId: "bb-ipad-pro",
        name: "Apple 11-inch iPad Pro M4 Wi-Fi 256GB",
        price: 999,
        url: "https://bestbuy.com/ipad-pro",
        image: "ipad-pro.jpg"
      }
    ]);
    searchWalmart.mockResolvedValue([]);

    const results = await searchProductsAcrossRetailers("ipad pro");

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Apple 11-inch iPad Pro M4 Wi-Fi 256GB");
  });

  it("returns up to ten product groups by default", async () => {
    searchBestBuy.mockResolvedValue(
      Array.from({ length: 25 }, (_, index) => ({
        retailer: "BestBuy",
        retailerId: `bb-${index}`,
        name: `Unique Test Product ${index + 1}GB`,
        price: index + 1,
        url: `https://bestbuy.com/product-${index}`,
        image: `product-${index}.jpg`
      }))
    );
    searchWalmart.mockResolvedValue([]);

    const results = await searchProductsAcrossRetailers("test product");

    expect(results).toHaveLength(10);
  });

  it("getProductAcrossRetailers returns the best individual match", async () => {
    searchBestBuy.mockResolvedValue([
      {
        retailer: "BestBuy",
        retailerId: "bb-2",
        name: "Samsung 55 Class QLED 4K TV",
        price: 699,
        url: "https://bestbuy.com/tv",
        image: "tv-bestbuy.jpg"
      }
    ]);

    searchWalmart.mockResolvedValue([
      {
        retailer: "Walmart",
        retailerId: "wm-2",
        name: "Samsung 55-inch QLED 4K Smart TV",
        price: 649,
        url: "https://walmart.com/tv",
        image: "tv-walmart.jpg"
      }
    ]);

    const result = await getProductAcrossRetailers("samsung qled tv");

    expect(result.cheapestRetailer).toBe("Walmart");
    expect(result.lowestPrice).toBe(649);
    expect(result.offers).toHaveLength(1);
  });

  it("throws when neither retailer returns results", async () => {
    searchBestBuy.mockResolvedValue([]);
    searchWalmart.mockResolvedValue([]);

    await expect(searchProductsAcrossRetailers("unknown product")).rejects.toThrow(
      "No results from any retailer"
    );
  });

  it("treats URL-looking input as a plain search query", async () => {
    searchBestBuy.mockResolvedValue([]);
    searchWalmart.mockResolvedValue([]);

    await expect(searchProductsAcrossRetailers(
      "https://www.walmart.com/ip/2026-11-inch-iPad-Air-M4-Wi-Fi-128GB-Purple/19659462511"
    )).rejects.toThrow("No results from any retailer");

    expect(searchBestBuy).toHaveBeenCalledWith(
      "https://www.walmart.com/ip/2026-11-inch-iPad-Air-M4-Wi-Fi-128GB-Purple/19659462511"
    );
    expect(searchWalmart).toHaveBeenCalledWith(
      "https://www.walmart.com/ip/2026-11-inch-iPad-Air-M4-Wi-Fi-128GB-Purple/19659462511"
    );
  });
});
