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

    expect(updated.id).toBe("abc");
    expect(updated.itemId).toBe("abc");
    expect(updated.title).toBe("Apple iPad Air");
    expect(updated.name).toBe("Apple iPad Air");
    expect(updated.image).toBe("saved.jpg");
    expect(updated.url).toBe("https://bestbuy.com/ipad-air");
    expect(updated.cheapestPrice).toBe(579);
    expect(updated.lowestPrice).toBe(579);
    expect(updated.cheapestRetailer).toBe("Walmart");
    expect(updated.offers).toHaveLength(1);
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
    expect(updated.title).toBe("Samsung 55 Class QLED 4K TV");
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
});
