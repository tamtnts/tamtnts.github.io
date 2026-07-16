import test from "node:test";
import assert from "node:assert/strict";
import { buildSubIds, normalizeShopeeUrl, sanitizeSubIdPart } from "./affiliate.js";

test("chuẩn hóa link Shopee hợp lệ", () => {
  assert.equal(normalizeShopeeUrl("shopee.vn/product/1/2#review"), "https://shopee.vn/product/1/2");
});

test("từ chối URL Shopee giả mạo hoặc không an toàn", () => {
  assert.throws(() => normalizeShopeeUrl("https://shopee.vn.example.com/product/1/2"));
  assert.throws(() => normalizeShopeeUrl("http://shopee.vn/product/1/2"));
  assert.throws(() => normalizeShopeeUrl("https://user:pass@shopee.vn/product/1/2"));
  assert.throws(() => normalizeShopeeUrl("https://shopee.vn:8443/product/1/2"));
});

test("lấy origin_link từ an_redir cũ", () => {
  const old = "https://s.shopee.vn/an_redir?origin_link=https%3A%2F%2Fshopee.vn%2Fproduct%2F1%2F2&affiliate_id=11111";
  assert.equal(normalizeShopeeUrl(old), "https://shopee.vn/product/1/2");
});

test("giữ short link Shopee không có origin_link", () => {
  assert.equal(normalizeShopeeUrl("https://s.shopee.vn/8A1b2C3d4E"), "https://s.shopee.vn/8A1b2C3d4E");
});

test("chuẩn hóa sub id thành tối đa 40 ký tự ASCII", () => {
  assert.equal(sanitizeSubIdPart("Đồ gia dụng tháng 7"), "do-gia-dung-thang-7");
  assert.equal(sanitizeSubIdPart("x".repeat(60)).length, 40);
});

test("tạo tối đa năm sub ids và bỏ phần rỗng", () => {
  assert.deepEqual(
    buildSubIds(["Facebook", "Đồ gia dụng tháng 7", "", "Video 01", "A", "B", "C"]),
    ["facebook", "do-gia-dung-thang-7", "video-01", "a", "b"],
  );
});
