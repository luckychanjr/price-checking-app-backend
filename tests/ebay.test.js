import { resetEbayAccessTokenCache, searchEbay } from "../retailers/ebay.js";

global.fetch = jest.fn();

describe("eBay retailer adapter", () => {
  beforeEach(() => {
    fetch.mockReset();
    resetEbayAccessTokenCache();
    process.env.EBAY_CLIENT_ID = "client-id";
    process.env.EBAY_CLIENT_SECRET = "client-secret";
  });

  it("searchEbay mints an app token and returns normalized products", async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "app-token",
          expires_in: 7200
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          itemSummaries: [
            {
              itemId: "v1|123|0",
              title: "Apple iPad Air M3 11-inch 128GB",
              itemWebUrl: "https://www.ebay.com/itm/123",
              image: {
                imageUrl: "ipad.jpg"
              },
              price: {
                value: "579.99"
              }
            }
          ]
        })
      });

    const results = await searchEbay("ipad air");

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "https://api.ebay.com/identity/v1/oauth2/token",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from("client-id:client-secret").toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope"
      }
    );

    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "https://api.ebay.com/buy/browse/v1/item_summary/search?q=ipad%20air&limit=5",
      {
        headers: {
          Authorization: "Bearer app-token",
          "X-EBAY-C-MARKETPLACE-ID": "EBAY_US"
        }
      }
    );

    expect(results).toEqual([
      {
        retailer: "eBay",
        retailerId: "v1|123|0",
        name: "Apple iPad Air M3 11-inch 128GB",
        price: 579.99,
        url: "https://www.ebay.com/itm/123",
        image: "ipad.jpg"
      }
    ]);
  });

  it("reuses the cached access token across searches", async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "cached-token",
          expires_in: 7200
        })
      })
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          itemSummaries: []
        })
      });

    await searchEbay("ipad");
    await searchEbay("macbook");

    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
