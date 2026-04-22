import { getWalmartById, searchWalmart } from "../retailers/walmart.js";

global.fetch = jest.fn();

describe("Walmart retailer adapter", () => {
  beforeEach(() => {
    fetch.mockReset();
    process.env.WALMART_RAPIDAPI_KEY = "test-key";
  });

  it("searchWalmart returns normalized Walmart products and uses RapidAPI headers", async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        body: {
          products: [
            {
              title: "Walmart Laptop",
              price: {
                currentPrice: "$899.00"
              },
              link: "https://www.walmart.com/ip/abc",
              image: "img.jpg"
            }
          ]
        }
      })
    });

    const results = await searchWalmart("laptop");

    expect(fetch).toHaveBeenCalledWith(
      "https://walmart-api4.p.rapidapi.com/walmart-serp.php?url=https%3A%2F%2Fwww.walmart.com%2Fsearch%3Fq%3Dlaptop",
      {
        headers: {
          "Content-Type": "application/json",
          "X-RapidAPI-Key": "test-key",
          "X-RapidAPI-Host": "walmart-api4.p.rapidapi.com"
        }
      }
    );
    expect(results).toEqual([
      {
        retailer: "Walmart",
        retailerId: "abc",
        name: "Walmart Laptop",
        price: 899,
        url: "https://www.walmart.com/ip/abc",
        image: "img.jpg"
      }
    ]);
  });

  it("searchWalmart limits results to five items", async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        body: {
          products: Array.from({ length: 7 }, (_, index) => ({
            title: `Item ${index}`,
            price: {
              currentPrice: `$${index + 10}.00`
            },
            link: `https://www.walmart.com/ip/id-${index}`,
            image: `img-${index}.jpg`
          }))
        }
      })
    });

    const results = await searchWalmart("monitor");

    expect(results).toHaveLength(5);
    expect(results[4].retailerId).toBe("id-4");
  });

  it("searchWalmart encodes multi-word queries once", async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        body: {
          products: []
        }
      })
    });

    await searchWalmart("ipad air");

    expect(fetch).toHaveBeenCalledWith(
      "https://walmart-api4.p.rapidapi.com/walmart-serp.php?url=https%3A%2F%2Fwww.walmart.com%2Fsearch%3Fq%3Dipad%2Bair",
      expect.any(Object)
    );
  });

  it("getWalmartById returns the first normalized result", async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        body: {
          title: "Walmart Tablet",
          price: "$299.00",
          images: ["tablet.jpg"]
        }
      })
    });

    const result = await getWalmartById("w-123");

    expect(fetch).toHaveBeenCalledWith(
      "https://walmart-api4.p.rapidapi.com/product-details.php?url=https%3A%2F%2Fwww.walmart.com%2Fip%2Fw-123",
      {
        headers: {
          "Content-Type": "application/json",
          "X-RapidAPI-Key": "test-key",
          "X-RapidAPI-Host": "walmart-api4.p.rapidapi.com"
        }
      }
    );
    expect(result).toEqual({
      retailer: "Walmart",
      retailerId: "w-123",
      name: "Walmart Tablet",
      price: 299,
      url: "https://www.walmart.com/ip/w-123",
      image: "tablet.jpg"
    });
  });

  it("getWalmartById throws when Walmart returns no results", async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        body: {}
      })
    });

    await expect(getWalmartById("missing")).rejects.toThrow("Walmart product not found");
  });

  it("throws a useful error when the Walmart API key is missing", async () => {
    delete process.env.WALMART_RAPIDAPI_KEY;

    await expect(searchWalmart("laptop")).rejects.toThrow(
      "Missing required environment variable: WALMART_RAPIDAPI_KEY"
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("throws a useful error when Walmart search fails", async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ message: "Invalid RapidAPI key" })
    });

    await expect(searchWalmart("laptop")).rejects.toThrow(
      "Walmart search request failed with 401: Invalid RapidAPI key"
    );
  });
});
