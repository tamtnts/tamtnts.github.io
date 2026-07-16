import { buildSubIds, normalizeShopeeUrl } from "./affiliate.js";
import { requestShortLink } from "./short-link-client.js";

const STORAGE = {
  history: "linkhoahong.history",
};

const elements = {
  form: document.querySelector("#converter-form"),
  productUrl: document.querySelector("#product-url"),
  source: document.querySelector("#source"),
  campaign: document.querySelector("#campaign"),
  contentCode: document.querySelector("#content-code"),
  formMessage: document.querySelector("#form-message"),
  result: document.querySelector("#result"),
  resultValue: document.querySelector("#affiliate-result"),
  openButton: document.querySelector("#open-button"),
  copyButton: document.querySelector("#copy-button"),
  pasteButton: document.querySelector("#paste-button"),
  clearTracking: document.querySelector("#clear-tracking"),
  idStatus: document.querySelector("#id-status"),
  toast: document.querySelector("#toast"),
  historySection: document.querySelector("#history-section"),
  historyList: document.querySelector("#history-list"),
  clearHistory: document.querySelector("#clear-history"),
};

let toastTimer;

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE.history)) || [];
  } catch {
    return [];
  }
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("toast--visible");
  toastTimer = setTimeout(() => elements.toast.classList.remove("toast--visible"), 2200);
}

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

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const helper = document.createElement("textarea");
    helper.value = value;
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.appendChild(helper);
    helper.select();
    document.execCommand("copy");
    helper.remove();
  }
}

function addToHistory(originalUrl, affiliateUrl, subId) {
  const history = getHistory().filter((item) => item.affiliateUrl !== affiliateUrl);
  history.unshift({
    id: crypto.randomUUID?.() || String(Date.now()),
    originalUrl,
    affiliateUrl,
    subId,
    createdAt: new Date().toISOString(),
  });
  localStorage.setItem(STORAGE.history, JSON.stringify(history.slice(0, 20)));
  renderHistory();
}

function formatTime(value) {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(value));
}

function renderHistory() {
  const history = getHistory();
  elements.historySection.hidden = history.length === 0;
  elements.historyList.replaceChildren();

  history.forEach((item) => {
    const row = document.createElement("article");
    row.className = "history-item";

    const details = document.createElement("div");
    details.className = "history-item__details";
    const title = document.createElement("strong");
    title.textContent = item.subId || "Link không gắn nhãn";
    const url = document.createElement("span");
    url.textContent = item.originalUrl;
    const time = document.createElement("small");
    time.textContent = formatTime(item.createdAt);
    details.append(title, url, time);

    const button = document.createElement("button");
    button.className = "button button--outline button--small";
    button.type = "button";
    button.textContent = "Sao chép";
    button.addEventListener("click", async () => {
      await copyText(item.affiliateUrl);
      showToast("Đã sao chép link");
    });

    row.append(details, button);
    elements.historyList.append(row);
  });
}

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.formMessage.textContent = "";
  elements.result.hidden = true;
  setServiceState("loading");
  try {
    const originalUrl = normalizeShopeeUrl(elements.productUrl.value);
    const subIds = buildSubIds([
      elements.source.value,
      elements.campaign.value,
      elements.contentCode.value,
    ]);
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

elements.copyButton.addEventListener("click", async () => {
  await copyText(elements.resultValue.value);
  elements.copyButton.textContent = "Đã sao chép ✓";
  showToast("Đã sao chép link Affiliate");
  setTimeout(() => (elements.copyButton.textContent = "Sao chép link"), 1800);
});

elements.pasteButton.addEventListener("click", async () => {
  try {
    elements.productUrl.value = await navigator.clipboard.readText();
    elements.productUrl.focus();
  } catch {
    showToast("Trình duyệt chưa cho phép đọc bộ nhớ tạm");
  }
});

elements.clearTracking.addEventListener("click", () => {
  elements.source.value = "";
  elements.campaign.value = "";
  elements.contentCode.value = "";
});

elements.clearHistory.addEventListener("click", () => {
  localStorage.removeItem(STORAGE.history);
  renderHistory();
  showToast("Đã xóa lịch sử");
});

setServiceState("ready");
renderHistory();
