import { searchBestBuy } from "../retailers/bestbuy.js";

global.fetch = jest.fn();

describe("searchBestBuy", () => {
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
});
