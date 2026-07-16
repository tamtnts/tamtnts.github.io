import test from "node:test";
import assert from "node:assert/strict";
import { requestShortLink, ShortLinkClientError } from "./short-link-client.js";

test("gửi same-origin request và trả short link", async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ shortLink: "https://s.shopee.vn/abc" }) };
  };
  const input = { originUrl: "https://shopee.vn/product/1/2", subIds: ["facebook"] };
  assert.equal(await requestShortLink(input, fetchImpl), "https://s.shopee.vn/abc");
  assert.equal(request.url, "/.netlify/functions/shopee-short-link");
  assert.deepEqual(JSON.parse(request.options.body), input);
});

test("chuẩn hóa lỗi backend và lỗi mạng", async () => {
  const backend = async () => ({
    ok: false,
    json: async () => ({
      error: { code: "SERVICE_NOT_CONFIGURED", message: "Chưa kích hoạt." },
    }),
  });
  await assert.rejects(
    requestShortLink({ originUrl: "x", subIds: [] }, backend),
    (error) => error instanceof ShortLinkClientError && error.code === "SERVICE_NOT_CONFIGURED",
  );
  await assert.rejects(
    requestShortLink(
      { originUrl: "x", subIds: [] },
      async () => {
        throw new TypeError("network");
      },
    ),
    (error) => error.code === "UPSTREAM_UNAVAILABLE",
  );
});
