import { searchWalmart } from "../retailers/walmart.js";

global.fetch = jest.fn();

describe("searchWalmart", () => {
  it("returns normalized Walmart products", async () => {
    fetch.mockResolvedValue({
      json: async () => ({
        results: [
          {
            id: "abc",
            name: "Walmart Laptop",
            price: 899,
            url: "https://walmart.com/item",
            image: "img.jpg"
          }
        ]
      })
    });

    const results = await searchWalmart("laptop");

    expect(results[0].retailer).toBe("Walmart");
    expect(results[0].price).toBe(899);
  });
});