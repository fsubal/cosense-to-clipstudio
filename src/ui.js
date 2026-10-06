/**
 * 解析結果をページ送りできるモーダルとして表示する。
 * DOM にのみ依存し、window.cosense には依存しない。
 * モーダルはカスタム要素 `<ctcs-modal>` で、Cosense のグローバル CSS と
 * 衝突しないよう Shadow DOM の中に描画する
 */

import { formatPage, formatManifest, toFullWidthAlnum } from "./format.js";

/** @type {Record<import("./types.js").TextKind, string>} */
const KIND_LABELS = {
  dialogue: "セリフ",
  narration: "ナレーション",
  monologue: "モノローグ",
};

/**
 * Shadow DOM の中だけに適用されるスタイル。
 * `:host { all: initial }` で外側から継承されるフォントや色も遮断し、
 * 必要なものは .ctcs-dialog で明示的に指定する
 */
const CSS = `
:host { all: initial; }
.ctcs-overlay {
  position: fixed; inset: 0; z-index: 10000;
  background: rgba(0, 0, 0, 0.5);
  display: flex; align-items: center; justify-content: center;
}
.ctcs-dialog {
  background: #fff; color: #222;
  width: min(560px, calc(100vw - 32px));
  max-height: calc(100vh - 64px);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  display: flex; flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "Hiragino Sans", "Noto Sans JP", sans-serif;
  font-size: 14px; line-height: 1.6;
  box-sizing: border-box;
}
.ctcs-dialog *, .ctcs-dialog *::before, .ctcs-dialog *::after { box-sizing: inherit; }
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
.ctcs-notes {
  margin: 0 0 12px; padding: 8px 12px;
  background: #e7f1ff; border: 1px solid #b6d4fe; border-radius: 4px;
  color: #084298; list-style: none;
}
.ctcs-notes li::before { content: "ℹ "; }
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
  flex-wrap: wrap;
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
.ctcs-option {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 13px; color: #333; cursor: pointer; user-select: none;
}
.ctcs-option input { margin: 0; cursor: pointer; }
`;

const TAG_NAME = "ctcs-modal";

/**
 * 解析結果を表示するモーダル本体のカスタム要素 `<ctcs-modal>`。
 * Shadow DOM の中にスタイルと UI を持ち、`result` / `options` プロパティで表示内容を受け取る。
 * DOM から外れると自動的に keydown リスナーも外れる
 */
export class ClipStudioExportModal extends HTMLElement {
  static {
    if (!customElements.get(TAG_NAME)) {
      customElements.define(TAG_NAME, this);
    }
  }

  /**
   * モーダルを生成して document.body に追加する
   *
   * @param {import("./types.js").ParseResult} result
   * @param {import("./types.js").ManifestOptions} [options]
   * @returns {ClipStudioExportModal}
   */
  static openModal(result, options = {}) {
    const modal = /** @type {ClipStudioExportModal} */ (
      document.createElement(TAG_NAME)
    );

    modal.result = result;
    modal.options = options;
    document.body.appendChild(modal);
    return modal;
  }

  /** @type {import("./types.js").ParseResult} */
  #result = { pages: [], warnings: [] };

  /** 半角英数字を全角にして出力するか。縦書きのセリフ向けに既定でオン */
  #fullWidth = true;

  /** @type {import("./types.js").ManifestOptions} */
  #options = {};
  #index = 0;
  #dialog = el("div", "ctcs-dialog");

  /** @param {KeyboardEvent} event */
  #onKeydown = (event) => {
    if (event.key === "Escape") this.close();
  };

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CSS;
    const overlay = el("div", "ctcs-overlay");
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) this.close();
    });
    overlay.appendChild(this.#dialog);
    shadow.append(style, overlay);
  }

  get result() {
    return this.#result;
  }

  /** @param {import("./types.js").ParseResult} value */
  set result(value) {
    this.#result = value;
    this.#index = 0;
    if (this.isConnected) this.#render();
  }

  get options() {
    return this.#options;
  }

  /** @param {import("./types.js").ManifestOptions} value */
  set options(value) {
    this.#options = value;
    if (value.fullWidth !== undefined) this.#fullWidth = value.fullWidth;
    if (this.isConnected) this.#render();
  }

  connectedCallback() {
    document.addEventListener("keydown", this.#onKeydown);
    this.#render();
  }

  disconnectedCallback() {
    document.removeEventListener("keydown", this.#onKeydown);
  }

  /** モーダルを閉じる（DOM から取り除く） */
  close() {
    this.remove();
  }

  /** 呼び出し元のオプションにチェックボックスの状態を重ねた出力オプション */
  #formatOptions() {
    return { ...this.#options, fullWidth: this.#fullWidth };
  }

  #render() {
    const result = this.#result;
    const dialog = this.#dialog;
    dialog.replaceChildren();

    this.#renderHeader(dialog);
    this.#renderExportBar(dialog, result);

    const body = el("div", "ctcs-body");
    dialog.appendChild(body);

    if (result.pages.length === 0) {
      const empty = el("p", "ctcs-empty");
      empty.textContent =
        "ページ見出し（インデント0の「1.」「2.」…）が見つかりませんでした";
      body.appendChild(empty);
      appendWarnings(body, result.warnings);
      return;
    }

    const page = result.pages[this.#index];
    this.#renderPageTitle(body, page);
    this.#renderPageContent(body, result, page);
    this.#renderFooter(dialog, result, page);
  }

  /**
   * @param {HTMLDivElement} dialog 
   */
  #renderHeader(dialog) {
    const header = el("div", "ctcs-header");
    const title = el("h2");
    title.textContent = "CLIPSTUDIO用に出力";
    const closeButton = el("button", "ctcs-close");
    closeButton.textContent = "×";
    closeButton.addEventListener("click", () => this.close());
    header.append(title, closeButton);
    dialog.appendChild(header);
  }

  /**
   * @param {HTMLDivElement} dialog 
   * @param {import("./types.js").ParseResult} result 
   */
  #renderExportBar(dialog, result) {
    const manifestJSON = formatManifest(result, this.#formatOptions());
    const exportBar = el("div", "ctcs-footer");

    const option = el("label", "ctcs-option");
    const fullWidth = el("input");
    fullWidth.type = "checkbox";
    fullWidth.checked = this.#fullWidth;
    fullWidth.addEventListener("change", () => {
      this.#fullWidth = fullWidth.checked;
      this.#render();
    });
    option.append(fullWidth, document.createTextNode("半角英数字を全角にする"));
    const copyJSON = el("button");
    copyJSON.textContent = "Computer Use用JSONをコピー";
    const status = el("span", "ctcs-position");
    status.setAttribute("role", "status");
    copyJSON.addEventListener("click", async () => {
      const ok = await copyText(manifestJSON);
      status.textContent = ok
        ? "作品全体のJSONをコピーしました ✓"
        : "コピーに失敗しました。JSONを書き出して利用してください";
    });

    const downloadJSON = el("button");
    downloadJSON.textContent = "Computer Use用JSONを書き出す";
    downloadJSON.addEventListener("click", () => {
      try {
        downloadManifest(manifestJSON);
        status.textContent = "作品全体のJSONの書き出しを開始しました";
      } catch {
        status.textContent =
          "書き出しに失敗しました。JSONコピーをお試しください";
      }
    });
    exportBar.append(option, copyJSON, downloadJSON, status);
    dialog.appendChild(exportBar);
  }

  /**
   * @param {HTMLDivElement} body 
   * @param {import("./types.js").PlotPage} page 
   */
  #renderPageTitle(body, page) {
    const pageTitle = el("h3", "ctcs-page-title");
    const range =
      page.endNumber > page.number
        ? `${page.number}-${page.endNumber}ページ目（見開き）`
        : `${page.number}ページ目`;
    pageTitle.textContent = page.label ? `${range} — ${page.label}` : range;
    body.appendChild(pageTitle);
  }

  /**
   * @param {HTMLDivElement} body 
   * @param {import("./types.js").ParseResult} result 
   * @param {import("./types.js").PlotPage} page 
   */
  #renderPageContent(body, result, page) {
    appendWarnings(body, [...result.warnings, ...page.warnings]);
    appendNotes(body, page.notes);

    if (page.items.length === 0) {
      const empty = el("p", "ctcs-empty");
      empty.textContent = "抽出項目はありません（0件）";
      body.appendChild(empty);
    } else {
      this.#renderItemsList(body, page);
    }
  }

  /**
   * @param {HTMLDivElement} body 
   * @param {import("./types.js").PlotPage} page 
   */
  #renderItemsList(body, page) {
    const list = el("ul", "ctcs-items");
    for (const item of page.items) {
      const li = el("li");
      li.dataset.kind = item.kind;
      const kind = el("span", "ctcs-kind");
      kind.dataset.kind = item.kind;
      kind.textContent = KIND_LABELS[item.kind];
      const text = el("span", "ctcs-text");
      text.textContent = this.#fullWidth ? toFullWidthAlnum(item.text) : item.text;
      li.append(kind, text);
      list.appendChild(li);
    }
    body.appendChild(list);
  }

  /**
   * @param {HTMLDivElement} dialog 
   * @param {import("./types.js").ParseResult} result 
   * @param {import("./types.js").PlotPage} page 
   */
  #renderFooter(dialog, result, page) {
    const footer = el("div", "ctcs-footer");

    const prev = el("button");
    prev.textContent = "← 前ページ";
    prev.disabled = this.#index === 0;
    prev.addEventListener("click", () => {
      this.#index -= 1;
      this.#render();
    });

    const position = el("span", "ctcs-position");
    position.textContent = `${this.#index + 1} / ${result.pages.length}`;

    const copy = el("button", "ctcs-copy");
    copy.textContent = "このページをコピー";
    copy.disabled = page.items.length === 0;
    copy.addEventListener("click", async () => {
      const ok = await copyText(formatPage(page, this.#formatOptions()));
      copy.textContent = ok ? "コピーしました ✓" : "コピーに失敗しました";
      setTimeout(() => {
        copy.textContent = "このページをコピー";
      }, 1500);
    });

    const next = el("button");
    next.textContent = "次ページ →";
    next.disabled = this.#index === result.pages.length - 1;
    next.addEventListener("click", () => {
      this.#index += 1;
      this.#render();
    });

    footer.append(prev, position, copy, next);
    dialog.appendChild(footer);
  }
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
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      textarea.remove();
    }
  }
}

/**
 * @param {HTMLElement} parent
 * @param {string[]} warnings
 */
function appendWarnings(parent, warnings) {
  appendMessages(parent, "ctcs-warnings", warnings);
}

/**
 * 警告ではないが確認の目安になる情報（部分抽出した行など）
 * @param {HTMLElement} parent
 * @param {string[]} notes
 */
function appendNotes(parent, notes) {
  appendMessages(parent, "ctcs-notes", notes);
}

/**
 * @param {HTMLElement} parent
 * @param {string} className
 * @param {string[]} messages
 */
function appendMessages(parent, className, messages) {
  if (messages.length === 0) return;
  const list = el("ul", className);
  for (const message of messages) {
    const li = el("li");
    li.textContent = message;
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

/** @param {string} json */
function downloadManifest(json) {
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = el("a");
  link.href = url;
  link.download = "cosense-to-clipstudio.manifest.json";
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // ダウンロード開始前にURLが無効にならないよう遅延解放する。
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
