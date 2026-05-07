import fs from "fs";
import path from "path";
import { searchWalmart } from "../retailers/walmart.js";

function loadLocalEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");

  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [key, ...valueParts] = trimmed.split("=");
    const value = valueParts.join("=").trim().replace(/^["']|["']$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function formatProduct(product) {
  return {
    retailerId: product.retailerId,
    name: product.name,
    price: product.price,
    url: product.url
  };
}

async function main() {
  loadLocalEnv();

  const query = process.argv.slice(2).join(" ").trim() || "samsung galaxy tab";
  const startedAt = Date.now();
  const response = await searchWalmart(query, { debug: true });
  const results = response.items;
  const elapsedMs = Date.now() - startedAt;

  console.log(`QUERY: ${query}`);
  console.log(`COUNT: ${results.length}`);
  console.log(`ELAPSED_MS: ${elapsedMs}`);
  console.log("DEBUG:");
  console.log(JSON.stringify(response.debug, null, 2));
  console.table(results.slice(0, 10).map(formatProduct));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
