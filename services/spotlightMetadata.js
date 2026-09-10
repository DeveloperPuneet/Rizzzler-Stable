const MAX_HTML_BYTES = 1024 * 1024;

function decodeHtml(value) {
  return String(value || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function firstMatch(html, pattern) {
  const match = html.match(pattern);
  return match ? decodeHtml(match[1]) : "";
}

function metaContent(html, key) {
  const tag = html.match(new RegExp(`<meta\\b[^>]*(?:property|name)=["']${key}["'][^>]*>`, "i"))?.[0];
  if (!tag) return "";
  return tag.match(/content=["']([^"']*)["']/i)?.[1] ? decodeHtml(tag.match(/content=["']([^"']*)["']/i)[1]) : "";
}

function extractMetadata(html, url) {
  const title =
    metaContent(html, "og:title") ||
    metaContent(html, "twitter:title") ||
    firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ||
    url;
  const description =
    metaContent(html, "og:description") ||
    metaContent(html, "description") ||
    metaContent(html, "twitter:description") ||
    "No description available for this page.";

  return { title: title.slice(0, 200), description: description.slice(0, 500) };
}

async function fetchSpotlightMetadata(rawUrl) {
  let parsedUrl;
  try {
    parsedUrl = new URL(String(rawUrl || "").trim());
  } catch {
    throw new Error("Enter a valid URL.");
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Only http and https URLs are supported.");
  }

  const response = await fetch(parsedUrl, {
    headers: { "user-agent": "Rizzzler Spotlight Stories/1.0" },
    signal: AbortSignal.timeout(10000),
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`The page returned HTTP ${response.status}.`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) throw new Error("That URL does not point to an HTML page.");

  const html = (await response.text()).slice(0, MAX_HTML_BYTES);
  return { url: parsedUrl.toString(), ...extractMetadata(html, parsedUrl.toString()) };
}

module.exports = { extractMetadata, fetchSpotlightMetadata };