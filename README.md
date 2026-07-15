# Link Hoa Hồng

Công cụ web công khai giúp bạn bè tạo link sản phẩm Shopee bằng Affiliate ID cố định của chủ website. Dự án dùng HTML, CSS và JavaScript thuần nên không cần cài dependency.

## Cấu hình Affiliate ID của chủ website

Mở `site-config.js` và điền ID thật của bạn:

```js
export const OWNER_AFFILIATE_ID = "14354840000";
```

Đây là cấu hình duy nhất. Người dùng website không có ô nhập hoặc thay Affiliate ID. Mọi link tạo ra sẽ mang ID này.

## Chạy trên máy

Yêu cầu Node.js 18 trở lên:

```bash
npm start
```

Sau đó mở `http://127.0.0.1:4173`.

Chạy kiểm thử:

```bash
npm test
```

## Sử dụng

1. Chủ website đăng ký và chờ Shopee duyệt tài khoản tại https://affiliate.shopee.vn/.
2. Chủ website điền Affiliate ID vào `site-config.js` trước khi triển khai.
3. Bạn bè mở website và dán link sản phẩm Shopee.
4. Họ có thể chọn nguồn chia sẻ, chiến dịch/nội dung để tạo `sub_id`.
5. Khi bấm **Tạo link Affiliate**, kết quả luôn sử dụng Affiliate ID của chủ website.

Lịch sử được lưu bằng `localStorage` riêng trên trình duyệt của từng người dùng, không gửi về máy chủ.

## Triển khai

Đây là website tĩnh. Sau khi điền `site-config.js`, có thể kéo toàn bộ thư mục lên Netlify, Cloudflare Pages hoặc kết nối repository với Vercel. Không cần khai báo biến môi trường.

Trước khi quảng bá công khai, hãy đăng ký website/kênh sử dụng với Shopee Affiliate và bổ sung thông tin liên hệ, chính sách riêng tư phù hợp với hoạt động thực tế của bạn.

## Giới hạn bản MVP

- Link dài `shopee.vn` được kiểm tra trực tiếp.
- Link chia sẻ `s.shopee.vn` và `shope.ee` được dùng làm trang đích qua chuỗi chuyển hướng của Shopee. Luôn bấm **Mở thử** để xác nhận đúng sản phẩm.
- Công cụ tạo link theo định dạng `s.shopee.vn/an_redir` được Shopee công bố; nó không gọi API riêng tư và không đăng nhập vào tài khoản Shopee.
