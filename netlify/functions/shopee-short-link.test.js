import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createHandler } from "./shopee-short-link.js";

const env = { SHOPEE_APP_ID: "123456", SHOPEE_API_KEY: "demo" };
const event = {
  httpMethod: "POST",
  body: JSON.stringify({ originUrl: "https://shopee.vn/product/1/2", subIds: ["facebook"] }),
};

test("từ chối method khác POST", async () => {
  const response = await createHandler()({ httpMethod: "GET", body: "" });
  assert.equal(response.statusCode, 405);
});

test("fail closed khi thiếu credential", async () => {
  const response = await createHandler({ env: {} })(event);
  assert.equal(response.statusCode, 503);
  assert.equal(JSON.parse(response.body).error.code, "SERVICE_NOT_CONFIGURED");
});

test("ký đúng body gửi đi và trả short link", async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ data: { generateShortLink: { shortLink: "https://s.shopee.vn/abc" } } }) };
  };
  const response = await createHandler({
    env,
    now: () => 1577836800,
    fetchImpl,
  })(event);
  const signature = createHash("sha256").update(`1234561577836800${request.options.body}demo`, "utf8").digest("hex");
  assert.equal(request.url, "https://open-api.affiliate.shopee.vn/graphql");
  assert.match(request.options.headers.Authorization, new RegExp(`${signature}$`));
  assert.deepEqual(JSON.parse(response.body), { shortLink: "https://s.shopee.vn/abc" });
});

test("từ chối body lớn và hostname giả", async () => {
  assert.equal((await createHandler()({ httpMethod: "POST", body: "x".repeat(8193) })).statusCode, 413);
  const response = await createHandler({ env })({
    httpMethod: "POST",
    body: JSON.stringify({ originUrl: "https://shopee.vn.example.com/1", subIds: [] }),
  });
  assert.equal(response.statusCode, 400);
});

test("ánh xạ rate limit và không lộ secret", async () => {
  const response = await createHandler({
    env,
    fetchImpl: async () => ({ ok: true, json: async () => ({ errors: [{ extensions: { code: 10030 } }] }) }),
  })(event);
  assert.equal(response.statusCode, 429);
  assert.equal(JSON.parse(response.body).error.code, "RATE_LIMITED");
  assert.equal(JSON.stringify(response).includes("demo"), false);
});

test("ánh xạ fetch bị abort thành upstream unavailable", async () => {
  const abortFetch = async () => { throw Object.assign(new Error("aborted"), { name: "AbortError" }); };
  assert.equal((await createHandler({ env, fetchImpl: abortFetch })(event)).statusCode, 503);
});

test("ánh xạ lỗi xác thực Shopee", async () => {
  const authFetch = async () => ({ ok: true, json: async () => ({ errors: [{ extensions: { code: 10020 } }] }) });
  const response = await createHandler({ env, fetchImpl: authFetch })(event);
  assert.equal(JSON.parse(response.body).error.code, "SHOPEE_AUTH_ERROR");
});

test("từ chối JSON sai định dạng", async () => {
  assert.equal((await createHandler({ env })({ httpMethod: "POST", body: "{" })).statusCode, 400);
});

test("ánh xạ upstream HTTP error thành unavailable", async () => {
  const httpErrorFetch = async () => ({ ok: false });
  assert.equal((await createHandler({ env, fetchImpl: httpErrorFetch })(event)).statusCode, 503);
});
