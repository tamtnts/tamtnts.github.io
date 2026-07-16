# Thiết kế tích hợp Shopee Affiliate Short Link Open API

Ngày: 2026-07-16
Repository: `tamtnts/tamtnts.github.io`

## Mục tiêu

Thay cơ chế tự ghép URL `https://s.shopee.vn/an_redir` bằng Shopee Affiliate Open API chính thức qua mutation GraphQL `generateShortLink`.

Kết quả cần đạt:

- Người dùng dán URL Shopee hợp lệ và có thể cung cấp tối đa năm nhãn theo dõi.
- Trình duyệt chỉ gọi API cùng website; AppID và API key không xuất hiện trong mã nguồn, bundle, log trình duyệt hoặc phản hồi lỗi.
- Backend ký request đúng công thức Shopee và trả về `shortLink`.
- Giao diện, lịch sử `localStorage`, sao chép và mở thử link tiếp tục hoạt động.
- Khi Shopee chưa cấp quyền hoặc thiếu biến môi trường, hệ thống từ chối tạo link với thông báo rõ ràng; không âm thầm tạo link theo cơ chế cũ.

## Bối cảnh hiện tại

Dự án là website HTML/CSS/JavaScript thuần. `app.js` gọi `affiliate.js` để kiểm tra URL, tạo `sub_id`, rồi tự ghép `an_redir` với Affiliate ID công khai trong `site-config.js`.

Cách hiện tại không dùng Open API. Shopee Open API yêu cầu chữ ký chứa secret, nên logic ký không được đặt trong JavaScript phía trình duyệt.

Tài khoản Shopee được kiểm tra ngày 2026-07-16 đang hiển thị `AppID: --`, `API key: --`, nút **Áp dụng** bị vô hiệu hóa và thông báo chưa có quyền truy cập Open API. Phần mềm có thể được xây dựng và kiểm thử bằng fixture, nhưng kiểm thử tích hợp thật và phát hành chỉ thực hiện sau khi Shopee cấp quyền.

## Hợp đồng Shopee áp dụng

- Quy trình: đăng ký Affiliate → nhận AppID/Secret → chọn API → phát triển và kiểm thử → gọi API online.
- Endpoint: `POST https://open-api.affiliate.shopee.vn/graphql`.
- Content-Type: `application/json`.
- Mutation: `generateShortLink`.
- Input: `originUrl: String!`, `subIds: [String]` với tối đa năm phần tử.
- Output: `shortLink: String!`.
- Authorization: `SHA256 Credential={AppID}, Timestamp={UnixTimestamp}, Signature={signature}`.
- Chữ ký: `SHA256(AppID + Timestamp + Payload + Secret)`.
- Timestamp không được lệch quá 10 phút so với máy chủ.
- Giới hạn hiện tại: 8.000 request/giờ.
- GraphQL có thể trả HTTP 200 nhưng vẫn chứa trường `errors`.

Nguồn chính thức:

- https://affiliate.shopee.vn/open_api/home
- https://affiliate.shopee.vn/open_api/list?type=short_link
- https://affiliate.shopee.vn/open_api/document?type=authentication
- https://affiliate.shopee.vn/open_api/document?type=request_response

## Phương án đã chọn

Dùng Netlify Function làm lớp backend bảo mật.

Các phương án không chọn:

1. GitHub Pages + Cloudflare Worker: an toàn nhưng tạo thêm một nền tảng triển khai và cấu hình CORS/domain.
2. Gọi Shopee trực tiếp từ trình duyệt: bị loại vì làm lộ API key.
3. Tiếp tục tự ghép `an_redir`: bị loại vì không hoàn thành yêu cầu chuyển sang Open API.

## Kiến trúc

### Frontend

`app.js` giữ trách nhiệm:

- đọc form;
- chuẩn hóa dữ liệu theo dõi thành mảng tối đa năm `subIds`;
- gửi `POST /.netlify/functions/shopee-short-link`;
- hiển thị trạng thái đang xử lý và lỗi thân thiện;
- lưu short link thành công vào lịch sử;
- hỗ trợ sao chép và mở thử.

Frontend không còn đọc hoặc kiểm tra Affiliate ID. `site-config.js` bị xóa. Phần tử `id-status` được giữ lại nhưng đổi thành trạng thái dịch vụ: “Sẵn sàng tạo link”, “Đang tạo link” hoặc “Dịch vụ chưa được kích hoạt”.

### Netlify Function

`netlify/functions/shopee-short-link.js` chịu trách nhiệm:

1. Chỉ chấp nhận `POST`.
2. Giới hạn body ở 8 KiB, parse JSON và từ chối body sai.
3. Kiểm tra `originUrl` bằng allowlist hostname Shopee Việt Nam hiện có.
4. Kiểm tra `subIds` là mảng tối đa năm chuỗi; chuẩn hóa từng phần tử theo quy tắc ASCII hiện có và giới hạn 40 ký tự.
5. Đọc `SHOPEE_APP_ID` và `SHOPEE_API_KEY` từ biến môi trường.
6. Tạo payload JSON xác định, dùng GraphQL variables để tránh lỗi escape chuỗi.
7. Lấy Unix timestamp theo giây.
8. Tính SHA-256 trên chuỗi `AppID + Timestamp + Payload + APIKey`.
9. Gọi endpoint Shopee với Authorization và Content-Type chính xác, timeout 8 giây.
10. Kiểm tra HTTP response, GraphQL `errors` và `data.generateShortLink.shortLink`.
11. Chỉ trả `{ "shortLink": "..." }` khi thành công.

### Module dùng chung

Tách các hàm thuần để kiểm thử độc lập:

- chuẩn hóa và kiểm tra URL;
- chuẩn hóa `subIds`;
- dựng GraphQL payload;
- tạo signature;
- ánh xạ lỗi Shopee sang lỗi nội bộ.

Module dùng chung không đọc trực tiếp biến môi trường và không gọi mạng.

## Luồng dữ liệu

1. Người dùng dán link Shopee và nhấn tạo link.
2. Frontend kiểm tra dữ liệu cơ bản rồi gửi `originUrl` và `subIds` đến Netlify Function.
3. Function kiểm tra lại toàn bộ dữ liệu phía máy chủ.
4. Function dựng payload, ký request bằng secret trong môi trường Netlify và gọi Shopee.
5. Shopee trả `shortLink` hoặc GraphQL errors.
6. Function lọc phản hồi và trả kết quả tối thiểu cho frontend.
7. Frontend hiển thị kết quả và chỉ lúc này mới ghi lịch sử `localStorage`.

## Hợp đồng API nội bộ

Request:

```json
{
  "originUrl": "https://shopee.vn/...",
  "subIds": ["facebook", "review-thang-7", "video-01"]
}
```

Success:

```json
{
  "shortLink": "https://s.shopee.vn/..."
}
```

Error:

```json
{
  "error": {
    "code": "SERVICE_NOT_CONFIGURED",
    "message": "Dịch vụ tạo link chưa được chủ website kích hoạt."
  }
}
```

Mã lỗi nội bộ:

- `METHOD_NOT_ALLOWED`
- `INVALID_REQUEST`
- `INVALID_SHOPEE_URL`
- `SERVICE_NOT_CONFIGURED`
- `SHOPEE_AUTH_ERROR`
- `RATE_LIMITED`
- `SHOPEE_ERROR`
- `UPSTREAM_UNAVAILABLE`

Không trả stack trace, Authorization, AppID, API key, payload ký hoặc nội dung lỗi thô có thể chứa dữ liệu nhạy cảm.

## Xử lý lỗi và trải nghiệm người dùng

- Nút submit bị khóa trong lúc request đang chạy để tránh gửi trùng.
- Lỗi input hiển thị cạnh form.
- Lỗi chưa cấu hình hướng người dùng báo cho chủ website.
- Lỗi xác thực hoặc rate limit dùng thông báo trung tính; chi tiết kỹ thuật chỉ ghi log đã lọc phía server.
- Timeout upstream là 8 giây; frontend nhận thông báo thử lại sau.
- Nếu request thất bại, kết quả cũ bị ẩn và không ghi lịch sử.
- Không fallback sang `an_redir`; điều này tránh tạo cảm giác Open API đang hoạt động khi thực tế không phải vậy.

## Bảo mật và vận hành

- `SHOPEE_APP_ID` và `SHOPEE_API_KEY` chỉ được cấu hình trong Netlify Environment Variables.
- Không đặt credential trong `site-config.js`, `.env` được commit, HTML, JavaScript public hoặc log CI.
- Thêm `.env*` vào `.gitignore`, ngoại trừ file ví dụ không chứa giá trị thật nếu cần.
- Chỉ chấp nhận hostname Shopee trong allowlist; không cho URL có username, password, port lạ hoặc protocol khác HTTPS.
- Function không nhận endpoint từ client, tránh SSRF.
- Payload ký phải chính là chuỗi body gửi đến Shopee, không stringify lại sau khi ký.
- Log chỉ gồm request ID, loại lỗi và thời gian; không log URL đầy đủ nếu URL có query nhạy cảm.
- Rate limit Shopee được chuyển thành HTTP 429 cho client.
- Rate limit riêng ở Netlify chỉ bổ sung sau khi có lưu lượng thực; không thêm datastore trong phạm vi này.

## Kiểm thử

### Unit test

- URL Shopee hợp lệ và hostname giả mạo.
- URL `an_redir` đầu vào được mở lấy `origin_link`, kiểm tra lại allowlist rồi mới gửi Shopee; short link không có `origin_link` được gửi nguyên URL hợp lệ cho Shopee xử lý.
- Tối đa năm `subIds`, ký tự và độ dài hợp lệ.
- Payload GraphQL ổn định byte-for-byte.
- Signature SHA-256 khớp vector mẫu trong tài liệu Shopee.
- Ánh xạ mã lỗi 10010, 10020, 10030 và 11000.

### Function test

Mock `fetch` để kiểm tra:

- header Authorization;
- body được ký trùng với body được gửi;
- success response;
- HTTP lỗi;
- HTTP 200 kèm GraphQL errors;
- timeout;
- thiếu biến môi trường;
- method và body không hợp lệ.

### Frontend test

- trạng thái loading;
- thành công cập nhật result và lịch sử;
- thất bại không ghi lịch sử;
- hiển thị thông báo theo mã lỗi.

### Kiểm thử tích hợp thật

Chỉ thực hiện sau khi Shopee cấp AppID/API key. Dùng một URL sản phẩm Shopee hợp lệ, kiểm tra short link mở đúng sản phẩm và credential không xuất hiện trong log hoặc network response về trình duyệt.

## Triển khai

1. Shopee cấp quyền Open API, AppID và API key.
2. Cấu hình hai biến môi trường trên Netlify.
3. Deploy preview.
4. Chạy test tự động.
5. Gọi thử một short link trên preview và mở kiểm tra đích.
6. Kiểm tra log không lộ credential.
7. Chuyển domain sang Netlify hoặc xác nhận domain đang trỏ Netlify.
8. Deploy production.
9. Theo dõi lỗi xác thực, rate limit và upstream trong giai đoạn đầu.

Không phát hành giao diện đã chuyển sang Open API khi bước 1–2 chưa hoàn tất.

## Tiêu chí chấp nhận

- Secret không xuất hiện trong source hoặc response đến trình duyệt.
- Request ký đúng công thức và payload đã gửi.
- URL ngoài allowlist bị từ chối ở server.
- Shopee success trả short link và UI lưu lịch sử.
- GraphQL errors được nhận diện dù HTTP status là 200.
- Thiếu credential trả lỗi cấu hình an toàn.
- Toàn bộ test hiện có và test mới đều pass.
- README mô tả cách chạy, test, cấu hình Netlify và giới hạn quyền Open API.
- Kiểm thử production chỉ được đánh dấu hoàn tất sau khi có credential thật và short link mở đúng sản phẩm.
