import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  buildShopeePayload,
  createAuthorization,
  readShopeeResult,
  ShopeeApiError,
} from "./shopee-open-api.js";

test("dựng payload GraphQL ổn định", () => {
  const input = { originUrl: "https://shopee.vn/product/1/2", subIds: ["facebook"] };
  assert.equal(buildShopeePayload(input), JSON.stringify({
    query: "mutation GenerateShortLink($input: ShortLinkInput!) { generateShortLink(input: $input) { shortLink } }",
    variables: { input },
  }));
});

test("tạo authorization từ đúng payload bytes", () => {
  const payload = JSON.stringify({ query: "{ brandOffer { nodes { offerName } } }" });
  const signature = createHash("sha256").update(`1234561577836800${payload}demo`, "utf8").digest("hex");
  assert.equal(
    createAuthorization({ appId: "123456", timestamp: 1577836800, payload, secret: "demo" }),
    `SHA256 Credential=123456, Timestamp=1577836800, Signature=${signature}`,
  );
});

test("đọc short link thành công", () => {
  assert.equal(readShopeeResult({ data: { generateShortLink: { shortLink: "https://s.shopee.vn/abc" } } }), "https://s.shopee.vn/abc");
});

for (const [upstream, internal, status] of [
  [10020, "SHOPEE_AUTH_ERROR", 502],
  [10030, "RATE_LIMITED", 429],
  [10010, "SHOPEE_ERROR", 502],
  [11000, "SHOPEE_ERROR", 502],
]) {
  test(`ánh xạ lỗi ${upstream}`, () => {
    assert.throws(
      () => readShopeeResult({ errors: [{ extensions: { code: upstream } }] }),
      (error) => error instanceof ShopeeApiError && error.code === internal && error.status === status,
    );
  });
}
