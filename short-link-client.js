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
      throw new ShortLinkClientError(
        body?.error?.code || "SHOPEE_ERROR",
        body?.error?.message || "Không thể tạo link Shopee lúc này.",
      );
    }
    return body.shortLink;
  } catch (error) {
    if (error instanceof ShortLinkClientError) throw error;
    throw new ShortLinkClientError(
      "UPSTREAM_UNAVAILABLE",
      "Không thể kết nối dịch vụ tạo link.",
    );
  }
}
