import {
  buildBestBuyProductUrl,
  extractBestBuySku,
  normalizeBestBuyUrl
} from "../utils/bestBuyUrl.js";

describe("bestBuyUrl", () => {
  it("builds a browser product URL from a SKU and name", () => {
    expect(buildBestBuyProductUrl("6577401", "Dyson - V11 Plus Cordless Vacuum - Nickel/Purple"))
      .toBe("https://api.bestbuy.com/click/-/6577401/pdp");
  });

  it("extracts SKUs from Best Buy product and API click URLs", () => {
    expect(extractBestBuySku("https://www.bestbuy.com/site/-/6577401.p?cmp=RMX")).toBe("6577401");
    expect(extractBestBuySku("https://api.bestbuy.com/click/-/6577401/pdp")).toBe("6577401");
  });

  it("normalizes malformed Best Buy URLs to official API click links", () => {
    expect(normalizeBestBuyUrl(
      "https://www.bestbuy.com/site/-/6577401.p?cmp=RMX",
      null,
      "Dyson V11 Plus"
    )).toBe("https://api.bestbuy.com/click/-/6577401/pdp");
  });

  it("keeps official Best Buy API click links", () => {
    expect(normalizeBestBuyUrl(
      "https://api.bestbuy.com/click/-/6577401/pdp",
      null,
      "Dyson V11 Plus"
    )).toBe("https://api.bestbuy.com/click/-/6577401/pdp");
  });

  it("leaves non-Best Buy URLs alone", () => {
    expect(normalizeBestBuyUrl("https://www.walmart.com/ip/example/123")).toBe("https://www.walmart.com/ip/example/123");
  });
});
