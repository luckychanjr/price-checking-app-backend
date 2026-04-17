export function extractQuery(url) {
  try {
    const parts = url.split("/");
    
    // Get slug (usually second-to-last part)
    const slug = parts[parts.length - 2] || parts[parts.length - 1];

    if (!slug) {
      throw new Error("Could not extract product name from URL");
    }

    const query = slug
      .replace(/-/g, " ")
      .replace(/\b\d+\b/g, "") // remove numbers
      .trim();

    return query;

  } catch (err) {
    throw new Error("Failed to extract search query from URL");
  }
}