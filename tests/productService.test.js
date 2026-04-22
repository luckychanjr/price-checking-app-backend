jest.mock("../retailers/bestbuy.js", () => ({
  searchBestBuy: jest.fn(),
  getBestBuyById: jest.fn()
}));

jest.mock("../retailers/ebay.js", () => ({
  searchEbay: jest.fn()
}));

jest.mock("../retailers/walmart.js", () => ({
  searchWalmart: jest.fn(),
  getWalmartById: jest.fn()
}));

import { searchBestBuy } from "../retailers/bestbuy.js";
import { searchEbay } from "../retailers/ebay.js";
import { searchWalmart } from "../retailers/walmart.js";
import {
  getProductAcrossRetailers,
  searchProductsAcrossRetailers
} from "../utils/productService.js";

describe("productService aggregation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("includes eBay and Walmart offers in clustered cross-retailer results", async () => {
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

    searchEbay.mockResolvedValue([
      {
        retailer: "eBay",
        retailerId: "ebay-1",
        name: "Apple iPad Air M3 11 inch 128GB",
        price: 589,
        url: "https://ebay.com/ipad-air",
        image: "ebay.jpg"
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

    expect(results).toHaveLength(1);
    expect(results[0].cheapestRetailer).toBe("Walmart");
    expect(results[0].offers).toHaveLength(3);
    expect(results[0].offers.map((offer) => offer.retailer)).toEqual([
      "Walmart",
      "eBay",
      "BestBuy"
    ]);
  });

  it("getProductAcrossRetailers returns the best clustered match", async () => {
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

    searchEbay.mockResolvedValue([
      {
        retailer: "eBay",
        retailerId: "ebay-2",
        name: "Samsung 55-inch QLED 4K Smart TV",
        price: 659,
        url: "https://ebay.com/tv",
        image: "tv-ebay.jpg"
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
    expect(result.offers).toHaveLength(3);
  });

  it("throws when neither retailer returns results", async () => {
    searchBestBuy.mockResolvedValue([]);
    searchEbay.mockResolvedValue([]);
    searchWalmart.mockResolvedValue([]);

    await expect(searchProductsAcrossRetailers("unknown product")).rejects.toThrow(
      "No results from any retailer"
    );
  });
});
