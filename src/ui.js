/**
 * 解析結果をページ送りできるモーダルとして表示する。
 * DOM にのみ依存し、window.cosense には依存しない。
 * モーダルはカスタム要素 `<ctcs-modal>` で、Cosense のグローバル CSS と
 * 衝突しないよう Shadow DOM の中に描画する
 */

import { formatPage, formatManifest, toFullWidthAlnum } from "./format.js";
import { emptyRecord, markCopied, diffPage, summarize } from "./sync.js";

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
.ctcs-summary {
  margin: 0 0 12px; padding: 8px 12px; border-radius: 4px; font-size: 13px;
  background: #f3f4f6; border: 1px solid #ddd; color: #333;
  display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: center;
}
.ctcs-summary[data-all-synced] { background: #e8f5e9; border-color: #a5d6a7; color: #1b5e20; }
.ctcs-summary-group { display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.ctcs-summary button {
  font-size: 12px; line-height: 1.5; padding: 0 8px; border-radius: 10px;
  border: 1px solid #bbb; background: #fff; cursor: pointer; color: #333;
}
.ctcs-summary button[data-status="changed"] { border-color: #ef6c00; color: #e65100; }
.ctcs-summary button[data-status="new"] { border-color: #1976d2; color: #0d47a1; }
.ctcs-summary button[data-status="renumbered"] { border-color: #7b1fa2; color: #6a1b9a; }
.ctcs-summary .ctcs-removed-page { color: #777; text-decoration: line-through; }
.ctcs-page-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; margin: 0 0 8px; }
.ctcs-page-title { margin: 0; font-size: 15px; font-weight: bold; }
.ctcs-status {
  font-size: 11px; padding: 1px 8px; border-radius: 10px; border: 1px solid; white-space: nowrap;
}
.ctcs-status[data-status="new"] { color: #0d47a1; border-color: #90caf9; background: #e3f2fd; }
.ctcs-status[data-status="changed"] { color: #e65100; border-color: #ffcc80; background: #fff3e0; }
.ctcs-status[data-status="renumbered"] { color: #6a1b9a; border-color: #ce93d8; background: #f3e5f5; }
.ctcs-status[data-status="synced"] { color: #1b5e20; border-color: #a5d6a7; background: #e8f5e9; }
.ctcs-meta { font-size: 11px; color: #777; }
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
.ctcs-diff-mark { flex-shrink: 0; width: 1.2em; text-align: center; font-size: 12px; font-weight: bold; }
.ctcs-items li[data-diff="removed"] { color: #999; background: #fafafa; }
.ctcs-items li[data-diff="removed"] .ctcs-text { text-decoration: line-through; }
.ctcs-items li[data-diff="removed"] .ctcs-diff-mark { color: #c62828; }
.ctcs-items li[data-diff="added"] { border-left: 3px solid #43a047; padding-left: 8px; background: #f1f8e9; }
.ctcs-items li[data-diff="added"] .ctcs-diff-mark { color: #2e7d32; }
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

/** 状態バッジの文言 */
const STATUS_LABELS = {
  new: "未コピー",
  changed: "変更あり",
  renumbered: "番号変更",
  synced: "反映済み",
};

/**
 * 解析結果を表示するモーダル本体のカスタム要素 `<ctcs-modal>`。
 * Shadow DOM の中にスタイルと UI を持ち、`result` / `options` プロパティで表示内容を受け取る。
 * `syncStore` を渡すと「このページをコピー」した時点の本文を記録し、
 * 次に開いたときに前回コピー後に変わったページを知らせる。
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
   * @param {import("./types.js").SyncStore | null} [syncStore] 反映状態の記録先。null なら追跡しない
   * @returns {ClipStudioExportModal}
   */
  static openModal(result, options = {}, syncStore = null) {
    const modal = /** @type {ClipStudioExportModal} */ (
      document.createElement(TAG_NAME)
    );

    modal.result = result;
    modal.options = options;
    modal.syncStore = syncStore;
    document.body.appendChild(modal);
    return modal;
  }

  /** @type {import("./types.js").ParseResult} */
  #result = { pages: [], warnings: [] };

  /** 半角英数字を全角にして出力するか。縦書きのセリフ向けに既定でオン */
  #fullWidth = true;

  /** @type {import("./types.js").ManifestOptions} */
  #options = {};

  /** @type {import("./types.js").SyncStore | null} */
  #syncStore = null;
  /** @type {import("./types.js").SyncRecord} */
  #record = emptyRecord();
  /** コピーの記録を保存できなかった（追跡が次回に引き継がれない） */
  #saveFailed = false;

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

  get syncStore() {
    return this.#syncStore;
  }

  /** @param {import("./types.js").SyncStore | null} value */
  set syncStore(value) {
    this.#syncStore = value;
    this.#record = value ? value.load() : emptyRecord();
    this.#saveFailed = false;
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
    this.#renderSummary(body);
    this.#renderPageTitle(body, page);
    this.#renderPageContent(body, result, page);
    this.#renderFooter(dialog, result, page);
  }

  /**
   * 作品全体の反映状態の概要。番号を押すとそのページへ移動する
   * @param {HTMLDivElement} body
   */
  #renderSummary(body) {
    if (!this.#syncStore) return;
    if (this.#saveFailed) {
      appendWarnings(body, [
        "コピーの記録を保存できませんでした。変更の追跡は次回に引き継がれません",
      ]);
    }

    const summary = summarize(this.#record, this.#result.pages);
    const box = el("div", "ctcs-summary");
    const groups = /** @type {const} */ ([
      ["前回コピー後に変更があるページ", summary.changed, "changed"],
      ["未コピー", summary.added, "new"],
      ["番号が変わったページ", summary.renumbered, "renumbered"],
    ]);
    for (const [label, pages, status] of groups) {
      if (pages.length === 0) continue;
      const group = el("span", "ctcs-summary-group");
      group.append(document.createTextNode(`${label}: `));
      for (const page of pages) {
        const button = el("button");
        button.dataset.status = status;
        button.textContent = formatRange(page);
        button.addEventListener("click", () => {
          this.#index = this.#result.pages.indexOf(page);
          this.#render();
        });
        group.appendChild(button);
      }
      box.appendChild(group);
    }
    if (summary.removed.length > 0) {
      const group = el("span", "ctcs-summary-group");
      group.append(document.createTextNode("削除されたページ: "));
      for (const range of summary.removed) {
        const span = el("span", "ctcs-removed-page");
        span.textContent = formatRange(range);
        group.appendChild(span);
      }
      box.appendChild(group);
    }
    if (box.childElementCount === 0) {
      box.dataset.allSynced = "";
      box.textContent = "すべてのページが反映済みです";
    }
    body.appendChild(box);
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
    const head = el("div", "ctcs-page-head");
    const pageTitle = el("h3", "ctcs-page-title");
    const range =
      page.endNumber > page.number
        ? `${page.number}-${page.endNumber}ページ目（見開き）`
        : `${page.number}ページ目`;
    pageTitle.textContent = page.label ? `${range} — ${page.label}` : range;
    head.appendChild(pageTitle);

    if (this.#syncStore) {
      const sync = diffPage(this.#record, page);
      const status = el("span", "ctcs-status");
      status.dataset.status = sync.status;
      status.textContent = STATUS_LABELS[sync.status];
      head.appendChild(status);

      const meta = el("span", "ctcs-meta");
      const notes = [];
      if (sync.previous && formatRange(sync.previous) !== formatRange(page)) {
        notes.push(`${formatRange(sync.previous)} → ${formatRange(page)}`);
      }
      if (sync.previous) {
        notes.push(`最後にコピー: ${formatDate(sync.previous.copiedAt)}`);
      }
      if (page.updated !== undefined) {
        notes.push(`最終更新: ${formatDate(page.updated * 1000)}`);
      }
      meta.textContent = notes.join(" ／ ");
      head.appendChild(meta);
    }
    body.appendChild(head);
  }

  /**
   * @param {HTMLDivElement} body 
   * @param {import("./types.js").ParseResult} result 
   * @param {import("./types.js").PlotPage} page 
   */
  #renderPageContent(body, result, page) {
    appendWarnings(body, [...result.warnings, ...page.warnings]);
    appendNotes(body, page.notes);

    // 追跡中は前回コピー時点との差分（削除された項目も含む）を表示する
    /** @type {import("./types.js").DiffItem[]} */
    const items = this.#syncStore
      ? diffPage(this.#record, page).items
      : page.items.map(({ kind, text }) => ({ type: "same", kind, text }));

    if (items.length === 0) {
      const empty = el("p", "ctcs-empty");
      empty.textContent = "抽出項目はありません（0件）";
      body.appendChild(empty);
    } else {
      this.#renderItemsList(body, items);
    }
  }

  /**
   * @param {HTMLDivElement} body 
   * @param {import("./types.js").DiffItem[]} items 
   */
  #renderItemsList(body, items) {
    const list = el("ul", "ctcs-items");
    for (const item of items) {
      const li = el("li");
      if (item.type !== "same") {
        li.dataset.diff = item.type;
        const mark = el("span", "ctcs-diff-mark");
        mark.textContent = item.type === "added" ? "+" : "−";
        li.appendChild(mark);
      }
      if (item.kind) {
        li.dataset.kind = item.kind;
        const kind = el("span", "ctcs-kind");
        kind.dataset.kind = item.kind;
        kind.textContent = KIND_LABELS[item.kind];
        li.appendChild(kind);
      }
      const text = el("span", "ctcs-text");
      text.textContent = this.#fullWidth ? toFullWidthAlnum(item.text) : item.text;
      li.appendChild(text);
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
      if (ok && this.#syncStore) {
        // コピーした時点の本文を記録し、バッジと概要を更新する
        this.#record = markCopied(this.#record, page, Date.now());
        this.#saveFailed = !this.#syncStore.save(this.#record);
        this.#render();
      }
      this.#flashCopyButton(ok);
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

  /**
   * コピー結果をボタンに一時表示する。再描画後でも現在のボタンに表示する
   * @param {boolean} ok
   */
  #flashCopyButton(ok) {
    const button = this.#dialog.querySelector(".ctcs-copy");
    if (!button) return;
    button.textContent = ok ? "コピーしました ✓" : "コピーに失敗しました";
    setTimeout(() => {
      if (button.isConnected) button.textContent = "このページをコピー";
    }, 1500);
  }
}

/**
 * ページ範囲の短い表記（`2` / `2-3`）
 * @param {{ number: number, endNumber: number }} range
 * @returns {string}
 */
function formatRange(range) {
  return range.endNumber > range.number
    ? `${range.number}-${range.endNumber}`
    : `${range.number}`;
}

/**
 * @param {number} ms ミリ秒
 * @returns {string} `10/9 14:20` のような短い日時
 */
function formatDate(ms) {
  return new Date(ms).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
