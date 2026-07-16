import { buildSubIds, normalizeShopeeUrl } from "../../affiliate.js";
import {
  buildShopeePayload,
  createAuthorization,
  readShopeeResult,
  SHOPEE_GRAPHQL_ENDPOINT,
  ShopeeApiError,
} from "../../shopee-open-api.js";

const headers = { "Content-Type": "application/json; charset=utf-8" };
const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });
const fail = (statusCode, code, message) => reply(statusCode, { error: { code, message } });

export function createHandler({ env = process.env, now = () => Math.floor(Date.now() / 1000), fetchImpl = fetch } = {}) {
  return async (event) => {
    if (event.httpMethod !== "POST") return fail(405, "METHOD_NOT_ALLOWED", "Chỉ hỗ trợ phương thức POST.");
    if (Buffer.byteLength(event.body || "", "utf8") > 8192) {
      return fail(413, "INVALID_REQUEST", "Dữ liệu gửi lên quá lớn.");
    }

    const appId = String(env.SHOPEE_APP_ID || "").trim();
    const secret = String(env.SHOPEE_API_KEY || "").trim();
    if (!appId || !secret) {
      return fail(503, "SERVICE_NOT_CONFIGURED", "Dịch vụ tạo link chưa được chủ website kích hoạt.");
    }

    try {
      const input = JSON.parse(event.body || "{}");
      if (!Array.isArray(input.subIds) || input.subIds.length > 5) throw new Error("invalid subIds");
      const payload = buildShopeePayload({
        originUrl: normalizeShopeeUrl(input.originUrl),
        subIds: buildSubIds(input.subIds),
      });
      const timestamp = now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      let upstream;
      try {
        upstream = await fetchImpl(SHOPEE_GRAPHQL_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: createAuthorization({ appId, timestamp, payload, secret }),
            "Content-Type": "application/json",
          },
          body: payload,
          signal: controller.signal,
        });
        if (!upstream.ok) return fail(503, "UPSTREAM_UNAVAILABLE", "Shopee tạm thời không phản hồi.");
        return reply(200, { shortLink: readShopeeResult(await upstream.json()) });
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      if (error instanceof ShopeeApiError) return fail(error.status, error.code, error.message);
      if (error?.name === "AbortError" || error instanceof TypeError) {
        return fail(503, "UPSTREAM_UNAVAILABLE", "Shopee tạm thời không phản hồi.");
      }
      return fail(400, "INVALID_REQUEST", "Dữ liệu tạo link không hợp lệ.");
    }
  };
}

export const handler = createHandler();
