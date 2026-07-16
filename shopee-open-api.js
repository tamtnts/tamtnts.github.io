import { createHash } from "node:crypto";

export const SHOPEE_GRAPHQL_ENDPOINT = "https://open-api.affiliate.shopee.vn/graphql";

export class ShopeeApiError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.name = "ShopeeApiError";
    this.code = code;
    this.status = status;
  }
}

export function buildShopeePayload(input) {
  return JSON.stringify({
    query: "mutation GenerateShortLink($input: ShortLinkInput!) { generateShortLink(input: $input) { shortLink } }",
    variables: { input },
  });
}

export function createAuthorization({ appId, timestamp, payload, secret }) {
  const signature = createHash("sha256")
    .update(`${appId}${timestamp}${payload}${secret}`, "utf8")
    .digest("hex");
  return `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`;
}

export function readShopeeResult(body) {
  const code = Number(body?.errors?.[0]?.extensions?.code);
  if (code === 10030) throw new ShopeeApiError("RATE_LIMITED", "Shopee đang giới hạn số lượt tạo link.", 429);
  if (code === 10020) throw new ShopeeApiError("SHOPEE_AUTH_ERROR", "Shopee từ chối thông tin xác thực.");
  if (body?.errors?.length) throw new ShopeeApiError("SHOPEE_ERROR", "Shopee không thể xử lý yêu cầu.");
  const shortLink = body?.data?.generateShortLink?.shortLink;
  if (typeof shortLink !== "string" || !shortLink.startsWith("https://")) {
    throw new ShopeeApiError("SHOPEE_ERROR", "Shopee trả về dữ liệu không hợp lệ.");
  }
  return shortLink;
}
