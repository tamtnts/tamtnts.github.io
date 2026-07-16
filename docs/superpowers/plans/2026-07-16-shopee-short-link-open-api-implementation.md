# Shopee Short Link Open API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace public browser-side `an_redir` construction with a Netlify Function that securely signs and calls Shopee Affiliate's `generateShortLink` GraphQL mutation.

**Architecture:** Keep the dependency-free static frontend, share pure validation helpers with a serverless function, and keep AppID/API key only in Netlify environment variables. The browser calls one same-origin endpoint and writes history only after Shopee returns a valid short link.

**Tech Stack:** HTML, CSS, JavaScript ES modules, Node.js 18+, `node:test`, Netlify Functions v1, Node `crypto`, Web/Node `fetch`.

## Global Constraints

- POST only to `https://open-api.affiliate.shopee.vn/graphql` with `Content-Type: application/json`.
- Authorization format: `SHA256 Credential={AppID}, Timestamp={UnixTimestamp}, Signature={signature}`.
- Signature input: exact UTF-8 bytes of `AppID + Timestamp + Payload + Secret`; signed payload equals sent body.
- Secrets exist only in `SHOPEE_APP_ID` and `SHOPEE_API_KEY` Netlify variables.
- Internal request body limit: 8 KiB. Shopee request timeout: 8 seconds.
- Accept only existing HTTPS Shopee Vietnam hosts, without credentials or custom ports.
- Accept at most five sanitized ASCII `subIds`, each at most 40 characters.
- Never expose credentials, signature material, stack traces, or raw upstream errors.
- Do not fall back to manually constructing `an_redir`.
- Add no runtime npm dependency.
- Production release remains blocked until Shopee grants Open API access and a real short link opens the intended product.

---

### Task 1: Replace the Browser-Link Helper Contract

**Files:**
- Modify: `affiliate.js:1-75`
- Modify: `affiliate.test.js:1-47`

**Interfaces:**
- Consumes: raw URL and tracking values.
- Produces: `normalizeShopeeUrl(rawUrl): string`, `sanitizeSubIdPart(value): string`, `buildSubIds(parts): string[]`.

- [ ] **Step 1: Write failing tests for array-based sub IDs**

Replace `affiliate.test.js` with:

```js
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
```

- [ ] **Step 2: Verify the new test fails**

Run:

```powershell
& 'C:\Users\ADMIN\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test affiliate.test.js
```

Expected: FAIL because `buildSubIds` is not exported.

- [ ] **Step 3: Implement the new helper and remove legacy link construction**

Delete `validateAffiliateId`, `buildSubId`, and `createAffiliateLink` from `affiliate.js`. Keep the URL and sanitizer functions, then add:

```js
export function buildSubIds(parts) {
  if (!Array.isArray(parts)) throw new Error("Danh sách nhãn theo dõi không hợp lệ.");
  return parts.map(sanitizeSubIdPart).filter(Boolean).slice(0, 5);
}
```

- [ ] **Step 4: Run Task 1 tests**

Run the command from Step 2.

Expected: 6 tests PASS.

- [ ] **Step 5: Commit Task 1**

```powershell
git add affiliate.js affiliate.test.js
git commit -m "Refactor Shopee URL and sub ID helpers"
```

---

### Task 2: Implement Shopee Payload, Signature, and Result Parsing

**Files:**
- Create: `shopee-open-api.js`
- Create: `shopee-open-api.test.js`

**Interfaces:**
- Consumes: normalized URL, `subIds`, AppID, secret, timestamp, and decoded upstream JSON.
- Produces: `buildShopeePayload`, `createAuthorization`, `readShopeeResult`, `ShopeeApiError`.

- [ ] **Step 1: Create the failing protocol tests**

Create `shopee-open-api.test.js`:

```js
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
```

- [ ] **Step 2: Verify the protocol test fails**

```powershell
& 'C:\Users\ADMIN\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test shopee-open-api.test.js
```

Expected: `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the complete pure protocol module**

Create `shopee-open-api.js`:

```js
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
```

- [ ] **Step 4: Run and commit Task 2**

Run Step 2; expect 7 tests PASS. Then:

```powershell
git add shopee-open-api.js shopee-open-api.test.js
git commit -m "Add Shopee Open API signing helpers"
```

---

### Task 3: Add the Fail-Closed Netlify Function

**Files:**
- Create: `netlify/functions/shopee-short-link.js`
- Create: `netlify/functions/shopee-short-link.test.js`

**Interfaces:**
- Consumes: Netlify `{ httpMethod, body }`, environment, clock, and fetch implementation.
- Produces: `{ statusCode, headers, body }` with `{ shortLink }` or `{ error: { code, message } }`.

- [ ] **Step 1: Create failing handler tests**

Create `netlify/functions/shopee-short-link.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createHandler } from "./shopee-short-link.js";

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
    env: { SHOPEE_APP_ID: "123456", SHOPEE_API_KEY: "demo" },
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
  const response = await createHandler({ env: { SHOPEE_APP_ID: "123456", SHOPEE_API_KEY: "demo" } })({
    httpMethod: "POST",
    body: JSON.stringify({ originUrl: "https://shopee.vn.example.com/1", subIds: [] }),
  });
  assert.equal(response.statusCode, 400);
});

test("ánh xạ rate limit và không lộ secret", async () => {
  const response = await createHandler({
    env: { SHOPEE_APP_ID: "123456", SHOPEE_API_KEY: "demo" },
    fetchImpl: async () => ({ ok: true, json: async () => ({ errors: [{ extensions: { code: 10030 } }] }) }),
  })(event);
  assert.equal(response.statusCode, 429);
  assert.equal(JSON.parse(response.body).error.code, "RATE_LIMITED");
  assert.equal(JSON.stringify(response).includes("demo"), false);
});
```

- [ ] **Step 2: Verify handler tests fail**

```powershell
& 'C:\Users\ADMIN\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test netlify/functions/shopee-short-link.test.js
```

Expected: `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the complete function**

Create `netlify/functions/shopee-short-link.js`:

```js
import { buildSubIds, normalizeShopeeUrl } from "../../affiliate.js";
import { buildShopeePayload, createAuthorization, readShopeeResult, SHOPEE_GRAPHQL_ENDPOINT, ShopeeApiError } from "../../shopee-open-api.js";

const headers = { "Content-Type": "application/json; charset=utf-8" };
const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });
const fail = (statusCode, code, message) => reply(statusCode, { error: { code, message } });

export function createHandler({ env = process.env, now = () => Math.floor(Date.now() / 1000), fetchImpl = fetch } = {}) {
  return async (event) => {
    if (event.httpMethod !== "POST") return fail(405, "METHOD_NOT_ALLOWED", "Chỉ hỗ trợ phương thức POST.");
    if (Buffer.byteLength(event.body || "", "utf8") > 8192) return fail(413, "INVALID_REQUEST", "Dữ liệu gửi lên quá lớn.");
    const appId = String(env.SHOPEE_APP_ID || "").trim();
    const secret = String(env.SHOPEE_API_KEY || "").trim();
    if (!appId || !secret) return fail(503, "SERVICE_NOT_CONFIGURED", "Dịch vụ tạo link chưa được chủ website kích hoạt.");

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
      } finally {
        clearTimeout(timeout);
      }
      if (!upstream.ok) return fail(503, "UPSTREAM_UNAVAILABLE", "Shopee tạm thời không phản hồi.");
      return reply(200, { shortLink: readShopeeResult(await upstream.json()) });
    } catch (error) {
      if (error instanceof ShopeeApiError) return fail(error.status, error.code, error.message);
      if (error?.name === "AbortError" || error instanceof TypeError) return fail(503, "UPSTREAM_UNAVAILABLE", "Shopee tạm thời không phản hồi.");
      return fail(400, "INVALID_REQUEST", "Dữ liệu tạo link không hợp lệ.");
    }
  };
}

export const handler = createHandler();
```

- [ ] **Step 4: Add abort, auth, malformed JSON, and upstream HTTP tests**

Add four tests that use these exact fakes and expectations:

```js
const abortFetch = async () => { throw Object.assign(new Error("aborted"), { name: "AbortError" }); };
const authFetch = async () => ({ ok: true, json: async () => ({ errors: [{ extensions: { code: 10020 } }] }) });
const httpErrorFetch = async () => ({ ok: false });

assert.equal((await createHandler({ env, fetchImpl: abortFetch })(event)).statusCode, 503);
assert.equal(JSON.parse((await createHandler({ env, fetchImpl: authFetch })(event)).body).error.code, "SHOPEE_AUTH_ERROR");
assert.equal((await createHandler({ env })({ httpMethod: "POST", body: "{" })).statusCode, 400);
assert.equal((await createHandler({ env, fetchImpl: httpErrorFetch })(event)).statusCode, 503);
```

Define `env` in the test file as `{ SHOPEE_APP_ID: "123456", SHOPEE_API_KEY: "demo" }`.

- [ ] **Step 5: Run and commit Task 3**

Run Step 2; expect all handler tests PASS. Then:

```powershell
git add netlify/functions/shopee-short-link.js netlify/functions/shopee-short-link.test.js
git commit -m "Add Shopee short link Netlify function"
```

---

### Task 4: Migrate the Browser UI

**Files:**
- Create: `short-link-client.js`
- Create: `short-link-client.test.js`
- Modify: `app.js:1-195`
- Modify: `index.html:43-48`
- Delete: `site-config.js`

**Interfaces:**
- Consumes: `{ originUrl, subIds }` and fetch.
- Produces: `requestShortLink(input, fetchImpl): Promise<string>` and `ShortLinkClientError`.

- [ ] **Step 1: Write failing client tests**

Create `short-link-client.test.js`:

```js
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
  const backend = async () => ({ ok: false, json: async () => ({ error: { code: "SERVICE_NOT_CONFIGURED", message: "Chưa kích hoạt." } }) });
  await assert.rejects(requestShortLink({ originUrl: "x", subIds: [] }, backend), (error) => error instanceof ShortLinkClientError && error.code === "SERVICE_NOT_CONFIGURED");
  await assert.rejects(requestShortLink({ originUrl: "x", subIds: [] }, async () => { throw new TypeError("network"); }), (error) => error.code === "UPSTREAM_UNAVAILABLE");
});
```

- [ ] **Step 2: Verify client tests fail**

```powershell
& 'C:\Users\ADMIN\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test short-link-client.test.js
```

Expected: `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the browser client**

Create `short-link-client.js`:

```js
export class ShortLinkClientError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ShortLinkClientError";
    this.code = code;
  }
}

export async function requestShortLink(input, fetchImpl = fetch) {
  try {
    const response = await fetchImpl("/.netlify/functions/shopee-short-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = await response.json();
    if (!response.ok || typeof body.shortLink !== "string") {
      throw new ShortLinkClientError(body?.error?.code || "SHOPEE_ERROR", body?.error?.message || "Không thể tạo link Shopee lúc này.");
    }
    return body.shortLink;
  } catch (error) {
    if (error instanceof ShortLinkClientError) throw error;
    throw new ShortLinkClientError("UPSTREAM_UNAVAILABLE", "Không thể kết nối dịch vụ tạo link.");
  }
}
```

- [ ] **Step 4: Replace the `app.js` imports, state helper, and submit listener**

Use these imports:

```js
import { buildSubIds, normalizeShopeeUrl } from "./affiliate.js";
import { requestShortLink } from "./short-link-client.js";
```

Delete `getAffiliateId` and `updateIdStatus`. Add:

```js
function setServiceState(state) {
  const button = elements.form.querySelector('button[type="submit"]');
  const states = {
    ready: [false, "Tạo link Affiliate →", "Sẵn sàng tạo link", true],
    loading: [true, "Đang tạo link…", "Đang tạo link", false],
    error: [false, "Tạo link Affiliate →", "Không thể tạo link", false],
    notConfigured: [false, "Tạo link Affiliate →", "Dịch vụ chưa được kích hoạt", false],
  };
  const [disabled, buttonText, statusText, ready] = states[state];
  button.disabled = disabled;
  button.textContent = buttonText;
  elements.idStatus.textContent = statusText;
  elements.idStatus.classList.toggle("status-pill--ready", ready);
}
```

Replace the submit listener with:

```js
elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.formMessage.textContent = "";
  elements.result.hidden = true;
  setServiceState("loading");
  try {
    const originalUrl = normalizeShopeeUrl(elements.productUrl.value);
    const subIds = buildSubIds([elements.source.value, elements.campaign.value, elements.contentCode.value]);
    const shortLink = await requestShortLink({ originUrl: originalUrl, subIds });
    elements.resultValue.value = shortLink;
    elements.openButton.href = shortLink;
    elements.result.hidden = false;
    addToHistory(originalUrl, shortLink, subIds.join("-"));
    elements.result.scrollIntoView({ behavior: "smooth", block: "nearest" });
    setServiceState("ready");
  } catch (error) {
    elements.formMessage.textContent = error.message;
    setServiceState(error.code === "SERVICE_NOT_CONFIGURED" ? "notConfigured" : "error");
  }
});
```

Call `setServiceState("ready")` during startup and delete `site-config.js`.

- [ ] **Step 5: Update status HTML**

Replace the `id-status` span with:

```html
<span class="status-pill status-pill--ready" id="id-status">Sẵn sàng tạo link</span>
```

- [ ] **Step 6: Run and commit Task 4**

Run Step 2 and the full suite:

```powershell
& 'C:\Users\ADMIN\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test
rg -n 'OWNER_AFFILIATE_ID|createAffiliateLink|validateAffiliateId|site-config' . -g '!docs/superpowers/**'
```

Expected: tests PASS and the scan returns no application-code match. Then:

```powershell
git add app.js index.html short-link-client.js short-link-client.test.js site-config.js
git commit -m "Use Shopee short link API from the frontend"
```

---

### Task 5: Configure Netlify and Document the Release Gate

**Files:**
- Create: `netlify.toml`
- Create: `.env.example`
- Modify: `.gitignore:1-2`
- Modify: `README.md:1-51`

**Interfaces:**
- Consumes: Netlify environment configuration.
- Produces: reproducible deployment and verification instructions.

- [ ] **Step 1: Add exact Netlify and environment files**

Create `netlify.toml`:

```toml
[build]
  publish = "."
  functions = "netlify/functions"

[functions]
  node_bundler = "esbuild"
```

Create `.env.example`:

```dotenv
SHOPEE_APP_ID=
SHOPEE_API_KEY=
```

Replace `.gitignore` with:

```gitignore
.netlify
.env
.env.*
!.env.example
```

- [ ] **Step 2: Replace README credential and deployment guidance**

Remove public Affiliate-ID instructions. Add:

```markdown
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
```

- [ ] **Step 3: Run final verification**

```powershell
& 'C:\Users\ADMIN\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test
git diff --check
rg -n 'OWNER_AFFILIATE_ID|17326430177|14354840000|createAffiliateLink|validateAffiliateId' . -g '!docs/superpowers/**'
```

Expected: all tests PASS; diff check and legacy/credential scan print nothing.

- [ ] **Step 4: Verify fail-closed behavior without credentials**

```powershell
& 'C:\Users\ADMIN\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --input-type=module -e "import('./netlify/functions/shopee-short-link.js').then(async ({createHandler}) => console.log(await createHandler({env:{}})({httpMethod:'POST',body:JSON.stringify({originUrl:'https://shopee.vn/product/1/2',subIds:[]})})))"
```

Expected: status `503`, code `SERVICE_NOT_CONFIGURED`, and no credential-like value.

- [ ] **Step 5: Commit, push, and keep production blocked**

```powershell
git add .env.example .gitignore netlify.toml README.md
git commit -m "Document Shopee Open API deployment"
git status -sb
git log --oneline main..HEAD
git push
```

Expected: the branch is clean and the draft PR contains the design, plan, implementation, tests, and docs. Do not deploy production until Shopee issues credentials and the preview verification in the global constraints passes.
