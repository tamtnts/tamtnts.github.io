import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSubId,
  createAffiliateLink,
  normalizeShopeeUrl,
  validateAffiliateId,
} from "./affiliate.js";

test("chuẩn hóa link Shopee hợp lệ", () => {
  assert.equal(normalizeShopeeUrl("shopee.vn/product/1/2#review"), "https://shopee.vn/product/1/2");
});

test("từ chối tên miền giả mạo", () => {
  assert.throws(() => normalizeShopeeUrl("https://shopee.vn.example.com/product/1/2"));
  assert.throws(() => normalizeShopeeUrl("http://shopee.vn/product/1/2"));
});

test("lấy trang đích từ link an_redir cũ", () => {
  const old = "https://s.shopee.vn/an_redir?origin_link=https%3A%2F%2Fshopee.vn%2Fproduct%2F1%2F2&affiliate_id=11111";
  assert.equal(normalizeShopeeUrl(old), "https://shopee.vn/product/1/2");
});

test("Affiliate ID chỉ gồm chữ số", () => {
  assert.equal(validateAffiliateId(" 14354840000 "), "14354840000");
  assert.throws(() => validateAffiliateId("abc-123"));
});

test("tạo sub_id an toàn", () => {
  assert.equal(buildSubId(["Facebook", "Đồ gia dụng tháng 7", "Video 01"]), "facebook-do-gia-dung-thang-7-video-01");
});

test("tạo đúng tracking link Shopee", () => {
  const result = createAffiliateLink({
    productUrl: "https://shopee.vn/product/1/2?utm_source=test",
    affiliateId: "14354840000",
    subId: "facebook-video-01",
  });
  const url = new URL(result);
  assert.equal(url.origin + url.pathname, "https://s.shopee.vn/an_redir");
  assert.equal(url.searchParams.get("origin_link"), "https://shopee.vn/product/1/2?utm_source=test");
  assert.equal(url.searchParams.get("affiliate_id"), "14354840000");
  assert.equal(url.searchParams.get("sub_id"), "facebook-video-01");
});
