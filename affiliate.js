export const ALLOWED_HOSTS = new Set([
  "shopee.vn",
  "www.shopee.vn",
  "m.shopee.vn",
  "s.shopee.vn",
  "shope.ee",
]);

export function normalizeShopeeUrl(rawUrl) {
  let value = String(rawUrl ?? "").trim();
  if (!value) throw new Error("Hãy dán link sản phẩm Shopee.");

  if (/^(?:www\.|m\.)?shopee\.vn\//i.test(value)) {
    value = `https://${value}`;
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Link không đúng định dạng. Hãy sao chép lại từ Shopee.");
  }

  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(hostname) || url.username || url.password || url.port) {
    throw new Error("Chỉ chấp nhận link HTTPS chính thức của Shopee Việt Nam.");
  }

  // Nếu đây đã là một link an_redir, lấy lại trang đích và gắn Affiliate ID mới.
  if (hostname === "s.shopee.vn" && url.pathname === "/an_redir") {
    const origin = url.searchParams.get("origin_link");
    if (origin) return normalizeShopeeUrl(origin);
  }

  url.hash = "";
  return url.toString();
}

export function validateAffiliateId(value) {
  const affiliateId = String(value ?? "").trim();
  if (!/^\d{5,20}$/.test(affiliateId)) {
    throw new Error("Affiliate ID cần gồm từ 5 đến 20 chữ số.");
  }
  return affiliateId;
}

export function sanitizeSubIdPart(value) {
  return String(value ?? "")
    .replace(/[đĐ]/g, (letter) => (letter === "Đ" ? "D" : "d"))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 40);
}

export function buildSubId(parts) {
  return parts.map(sanitizeSubIdPart).filter(Boolean).slice(0, 5).join("-");
}

export function createAffiliateLink({ productUrl, affiliateId, subId = "" }) {
  const originLink = normalizeShopeeUrl(productUrl);
  const validAffiliateId = validateAffiliateId(affiliateId);
  const trackingUrl = new URL("https://s.shopee.vn/an_redir");
  trackingUrl.searchParams.set("origin_link", originLink);
  trackingUrl.searchParams.set("affiliate_id", validAffiliateId);
  if (subId) trackingUrl.searchParams.set("sub_id", sanitizeSubIdPart(subId));
  return trackingUrl.toString();
}
