import {
  clusterProductGroups,
  scoreProductSimilarity
} from "../utils/productCluster.js";

describe("weighted product clustering", () => {
  it("scores the same product across retailers highly", () => {
    const score = scoreProductSimilarity(
      "Apple iPad Air M3 11-inch 128GB Wi-Fi",
      "Apple iPad Air M3 11 inch 128GB"
    );

    expect(score).toBeGreaterThan(6);
  });

  it("penalizes conflicting storage variants", () => {
    const score = scoreProductSimilarity(
      "Apple iPad Air M3 11-inch 128GB Wi-Fi",
      "Apple iPad Air M3 11-inch 256GB Wi-Fi"
    );

    expect(score).toBeLessThan(4.25);
  });

  it("penalizes conflicting screen sizes", () => {
    const score = scoreProductSimilarity(
      "Samsung 55 Class QLED 4K TV",
      "Samsung 65 Class QLED 4K TV"
    );

    expect(score).toBeLessThan(4.25);
  });

  it("clusters matching retailer listings together and separates conflicting variants", () => {
    const products = [
      {
        retailer: "BestBuy",
        name: "Apple iPad Air M3 11-inch 128GB Wi-Fi",
        price: 599
      },
      {
        retailer: "Walmart",
        name: "Apple iPad Air M3 11 inch 128GB",
        price: 579
      },
      {
        retailer: "Walmart",
        name: "Apple iPad Air M3 11-inch 256GB",
        price: 679
      }
    ];

    const clusters = clusterProductGroups(products, "ipad air m3");

    expect(clusters).toHaveLength(2);
    expect(clusters[0]).toHaveLength(2);
    expect(clusters[0].map(product => product.retailer)).toEqual([
      "BestBuy",
      "Walmart"
    ]);
    expect(clusters[1][0].name).toContain("256GB");
  });
});
