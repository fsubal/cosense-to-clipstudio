/**
 * 解析結果をページ送りできるモーダルとして表示する。
 * DOM にのみ依存し、window.cosense には依存しない
 */

import { formatPage } from "./format.js";

/** @type {Record<import("./types.js").TextKind, string>} */
const KIND_LABELS = {
  dialogue: "セリフ",
  narration: "ナレーション",
  monologue: "モノローグ",
};

const STYLE_ID = "ctcs-style";
const CSS = `
.ctcs-overlay {
  position: fixed; inset: 0; z-index: 10000;
  background: rgba(0, 0, 0, 0.5);
  display: flex; align-items: center; justify-content: center;
}
.ctcs-modal {
  background: #fff; color: #222;
  width: min(560px, calc(100vw - 32px));
  max-height: calc(100vh - 64px);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  display: flex; flex-direction: column;
  font-size: 14px; line-height: 1.6;
}
.ctcs-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; border-bottom: 1px solid #ddd;
}
.ctcs-header h2 { margin: 0; font-size: 16px; }
.ctcs-close {
  border: none; background: none; font-size: 20px; cursor: pointer;
  color: #666; padding: 0 4px;
}
.ctcs-body { padding: 16px; overflow-y: auto; }
.ctcs-page-title { margin: 0 0 8px; font-size: 15px; font-weight: bold; }
.ctcs-warnings {
  margin: 0 0 12px; padding: 8px 12px;
  background: #fff3cd; border: 1px solid #ffe08a; border-radius: 4px;
  color: #664d03; list-style: none;
}
.ctcs-warnings li::before { content: "⚠ "; }
.ctcs-items { margin: 0; padding: 0; list-style: none; }
.ctcs-items li {
  display: flex; align-items: baseline; gap: 8px;
  padding: 6px 0; border-bottom: 1px dotted #eee;
}
.ctcs-kind {
  flex-shrink: 0; font-size: 11px; padding: 1px 6px; border-radius: 3px;
  color: #fff; background: #607d8b;
}
.ctcs-kind[data-kind="dialogue"] { background: #1976d2; }
.ctcs-kind[data-kind="narration"] { background: #455a64; }
.ctcs-kind[data-kind="monologue"] { background: #8e24aa; }
.ctcs-text { white-space: pre-wrap; }
.ctcs-items li[data-kind="monologue"] .ctcs-text {
  font-family: "Hiragino Maru Gothic ProN", "Yu Gothic", sans-serif;
  color: #6a1b9a;
}
.ctcs-empty { color: #888; }
.ctcs-footer {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; padding: 12px 16px; border-top: 1px solid #ddd;
}
.ctcs-footer button {
  font-size: 13px; padding: 6px 12px; border-radius: 4px;
  border: 1px solid #ccc; background: #f5f5f5; cursor: pointer;
}
.ctcs-footer button:disabled { opacity: 0.4; cursor: default; }
.ctcs-copy { border-color: #1976d2 !important; background: #1976d2 !important; color: #fff; }
.ctcs-position { color: #666; font-size: 12px; }
`;

/**
 * @param {import("./types.js").ParseResult} result
 */
export function openModal(result) {
  injectStyle();

  let index = 0;

  const overlay = el("div", "ctcs-overlay");
  const modal = el("div", "ctcs-modal");
  overlay.appendChild(modal);

  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKeydown);
  };
  /** @param {KeyboardEvent} event */
  const onKeydown = (event) => {
    if (event.key === "Escape") close();
  };
  document.addEventListener("keydown", onKeydown);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });

  const render = () => {
    modal.replaceChildren();

    const header = el("div", "ctcs-header");
    const title = el("h2");
    title.textContent = "CSPへ書き出す";
    const closeButton = el("button", "ctcs-close");
    closeButton.textContent = "×";
    closeButton.addEventListener("click", close);
    header.append(title, closeButton);
    modal.appendChild(header);

    const body = el("div", "ctcs-body");
    modal.appendChild(body);

    if (result.pages.length === 0) {
      const empty = el("p", "ctcs-empty");
      empty.textContent =
        "ページ見出し（インデント0の「1.」「2.」…）が見つかりませんでした";
      body.appendChild(empty);
      appendWarnings(body, result.warnings);
      return;
    }

    const page = result.pages[index];

    const pageTitle = el("h3", "ctcs-page-title");
    pageTitle.textContent = page.label
      ? `${page.number}ページ目 — ${page.label}`
      : `${page.number}ページ目`;
    body.appendChild(pageTitle);

    appendWarnings(body, [...result.warnings, ...page.warnings]);

    if (page.items.length === 0) {
      const empty = el("p", "ctcs-empty");
      empty.textContent = "抽出項目はありません（0件）";
      body.appendChild(empty);
    } else {
      const list = el("ul", "ctcs-items");
      for (const item of page.items) {
        const li = el("li");
        li.dataset.kind = item.kind;
        const kind = el("span", "ctcs-kind");
        kind.dataset.kind = item.kind;
        kind.textContent = KIND_LABELS[item.kind];
        const text = el("span", "ctcs-text");
        text.textContent = item.text;
        li.append(kind, text);
        list.appendChild(li);
      }
      body.appendChild(list);
    }

    const footer = el("div", "ctcs-footer");

    const prev = el("button");
    prev.textContent = "← 前ページ";
    prev.disabled = index === 0;
    prev.addEventListener("click", () => {
      index -= 1;
      render();
    });

    const position = el("span", "ctcs-position");
    position.textContent = `${index + 1} / ${result.pages.length}`;

    const copy = el("button", "ctcs-copy");
    copy.textContent = "このページをコピー";
    copy.disabled = page.items.length === 0;
    copy.addEventListener("click", async () => {
      const ok = await copyText(formatPage(page));
      copy.textContent = ok ? "コピーしました ✓" : "コピーに失敗しました";
      setTimeout(() => {
        copy.textContent = "このページをコピー";
      }, 1500);
    });

    const next = el("button");
    next.textContent = "次ページ →";
    next.disabled = index === result.pages.length - 1;
    next.addEventListener("click", () => {
      index += 1;
      render();
    });

    footer.append(prev, position, copy, next);
    modal.appendChild(footer);
  };

  render();
  document.body.appendChild(overlay);
}

/**
 * @param {string} text
 * @returns {Promise<boolean>}
 */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // clipboard API が使えない環境向けのフォールバック
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  }
}

/**
 * @param {HTMLElement} parent
 * @param {string[]} warnings
 */
function appendWarnings(parent, warnings) {
  if (warnings.length === 0) return;
  const list = el("ul", "ctcs-warnings");
  for (const warning of warnings) {
    const li = el("li");
    li.textContent = warning;
    list.appendChild(li);
  }
  parent.appendChild(list);
}

/**
 * @template {keyof HTMLElementTagNameMap} T
 * @param {T} tag
 * @param {string} [className]
 * @returns {HTMLElementTagNameMap[T]}
 */
function el(tag, className) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  return element;
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
