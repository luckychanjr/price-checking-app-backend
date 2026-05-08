jest.mock("../utils/productService.js", () => ({
  getProductAcrossRetailers: jest.fn()
}));

import { getProductAcrossRetailers } from "../utils/productService.js";
import { refreshStoredItem } from "../utils/refreshStoredItem.js";

describe("refreshStoredItem", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("preserves the saved display fields while refreshing prices and offers", async () => {
    getProductAcrossRetailers.mockResolvedValue({
      title: "Apple iPad Air M3 11-inch 128GB",
      name: "Apple iPad Air M3 11-inch 128GB",
      cheapestPrice: 579,
      lowestPrice: 579,
      cheapestRetailer: "Walmart",
      offers: [
        {
          retailer: "Walmart",
          name: "Apple iPad Air M3 11 inch 128GB",
          price: 579,
          url: "https://walmart.com/ipad-air",
          image: "fresh.jpg"
        }
      ]
    });

    const updated = await refreshStoredItem({
      id: "abc",
      itemId: "abc",
      title: "Apple iPad Air",
      name: "Apple iPad Air",
      sourceInput: "ipad air",
      image: "saved.jpg",
      url: "https://bestbuy.com/ipad-air",
      cheapestPrice: 599,
      lowestPrice: 599,
      cheapestRetailer: "BestBuy",
      offers: []
    });

    expect(updated.itemId).toBe("abc");
    expect(updated.name).toBe("Apple iPad Air");
    expect(updated.image).toBe("saved.jpg");
    expect(updated.url).toBe("https://bestbuy.com/ipad-air");
    expect(updated.lowestPrice).toBe(579);
    expect(updated.cheapestRetailer).toBe("Walmart");
    expect(updated.offers).toHaveLength(1);
    expect(updated).not.toHaveProperty("id");
    expect(updated).not.toHaveProperty("title");
    expect(updated).not.toHaveProperty("cheapestPrice");
  });

  it("falls back to refreshed naming when the stored item has no usable display name", async () => {
    getProductAcrossRetailers.mockResolvedValue({
      title: "Samsung 55 Class QLED 4K TV",
      cheapestPrice: 649,
      cheapestRetailer: "Walmart",
      offers: [
        {
          retailer: "Walmart",
          name: "Samsung 55 Class QLED 4K TV",
          price: 649,
          url: "https://walmart.com/tv",
          image: "tv.jpg"
        }
      ]
    });

    const updated = await refreshStoredItem({
      id: "tv-1",
      itemId: "tv-1",
      name: "Unknown Item",
      title: "",
      sourceInput: "samsung qled tv"
    });

    expect(updated.name).toBe("Samsung 55 Class QLED 4K TV");
    expect(updated.image).toBe("tv.jpg");
    expect(updated.url).toBe("https://walmart.com/tv");
  });

  it("prefers a supported retailer URL over a broad saved search query during refresh", async () => {
    getProductAcrossRetailers.mockResolvedValue({
      title: "Nintendo Switch OLED",
      name: "Nintendo Switch OLED",
      cheapestPrice: 329,
      lowestPrice: 329,
      cheapestRetailer: "Walmart",
      offers: [
        {
          retailer: "Walmart",
          name: "Nintendo Switch OLED",
          price: 329,
          url: "https://www.walmart.com/ip/switch-oled",
          image: "switch.jpg"
        }
      ]
    });

    await refreshStoredItem({
      id: "switch-1",
      itemId: "switch-1",
      name: "Nintendo Switch OLED",
      title: "Nintendo Switch OLED",
      sourceInput: "nintendo switch",
      url: "https://www.walmart.com/ip/switch-oled",
      cheapestRetailer: "Walmart",
      offers: [
        {
          retailer: "Walmart",
          name: "Nintendo Switch OLED",
          price: 329,
          url: "https://www.walmart.com/ip/switch-oled"
        }
      ]
    });

    expect(getProductAcrossRetailers).toHaveBeenCalledWith(
      "https://www.walmart.com/ip/switch-oled"
    );
  });

  it("updates stale Best Buy URLs when a refresh returns a normalized product URL", async () => {
    getProductAcrossRetailers.mockResolvedValue({
      title: "Dyson V11 Plus",
      name: "Dyson V11 Plus",
      cheapestPrice: 399,
      lowestPrice: 399,
      cheapestRetailer: "BestBuy",
      url: "https://api.bestbuy.com/click/-/6577401/pdp",
      offers: [
        {
          retailer: "BestBuy",
          retailerId: "6577401",
          name: "Dyson V11 Plus",
          price: 399,
          url: "https://api.bestbuy.com/click/-/6577401/pdp",
          image: "dyson.jpg"
        }
      ]
    });

    const updated = await refreshStoredItem({
      id: "dyson-1",
      itemId: "dyson-1",
      name: "Dyson V11 Plus",
      title: "Dyson V11 Plus",
      url: "https://www.bestbuy.com/site/-/6577401.p?cmp=RMX",
      lowestPrice: 449,
      cheapestPrice: 449,
      cheapestRetailer: "BestBuy"
    });

    expect(updated.url).toBe("https://api.bestbuy.com/click/-/6577401/pdp");
    expect(updated.offers[0].url).toBe("https://api.bestbuy.com/click/-/6577401/pdp");
    expect(updated.lowestPrice).toBe(399);
  });
});
