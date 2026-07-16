# Link Hoa Hồng

Công cụ web giúp tạo short link sản phẩm Shopee qua Shopee Open API. Giao diện chạy bằng HTML, CSS và JavaScript thuần; lời gọi API được thực hiện qua Netlify Function để giữ bí mật thông tin xác thực.

## Chạy trên máy

Yêu cầu Node.js 18 trở lên:

UI-only static preview (the Netlify Function is not available in this mode):

```bash
npm start
```

Sau đó mở `http://127.0.0.1:4173`.

Full-stack local run (UI + Netlify Function):

```powershell
Copy-Item .env.example .env
# Fill .env with your own local SHOPEE_APP_ID and SHOPEE_API_KEY values.
npx netlify-cli dev
```

The ignored `.env` file is for local credentials only. Never commit it or paste real
credentials into source, documentation, issues, pull requests, or logs. Open the URL
printed by Netlify Dev (normally `http://localhost:8888`) to exercise the complete flow.
`npm start` remains UI-only and cannot create Shopee short links.

## Cấu hình Shopee Open API

Website dùng Netlify Function để giữ bí mật AppID/API key và gọi mutation `generateShortLink`.

1. Được Shopee cấp quyền tại https://affiliate.shopee.vn/open_api.
2. Tạo `SHOPEE_APP_ID` và `SHOPEE_API_KEY` trong Netlify Environment Variables.
3. Không ghi hai giá trị này vào source, `.env.example`, issue, PR hoặc log.

Nếu Shopee chưa cấp quyền, giao diện báo dịch vụ chưa được kích hoạt và không tạo `an_redir` dự phòng.

## Kiểm thử

Chạy `node --test`. `server.js` chỉ phục vụ file tĩnh; dùng Netlify Dev khi cần gọi function cục bộ.

## Phát hành

Chỉ phát hành production sau khi deploy preview dùng credential thật tạo được short link, short link mở đúng sản phẩm và log/network response không chứa credential.
