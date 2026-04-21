export function normalize(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, "");
}