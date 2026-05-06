jest.mock("../utils/productService.js", () => ({
  searchProductsAcrossRetailers: jest.fn()
}));

import { searchProductsAcrossRetailers } from "../utils/productService.js";
import { handler } from "../functions/searchItems.js";

describe("searchItems handler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns matching products from the product service", async () => {
    searchProductsAcrossRetailers.mockResolvedValue([
      {
        name: "Apple iPad Pro",
        lowestPrice: 999,
        offers: []
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
          offers: []
        }
      ]
    });
  });

  it("returns an empty result set instead of a server error when no retailers return results", async () => {
    searchProductsAcrossRetailers.mockRejectedValue(
      new Error("No results from any retailer")
    );

    const response = await handler({
      body: JSON.stringify({ query: "ipad pro" })
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ items: [] });
  });
});
