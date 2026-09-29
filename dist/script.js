"use strict";
(() => {
  // src/cosense.js
  var INDENT_PATTERN = /^[ \t　]*/;
  function getCosense() {
    const cosense = (
      /** @type {any} */
      globalThis.cosense ?? /** @type {any} */
      globalThis.scrapbox
    );
    if (!cosense) {
      throw new Error(
        "window.cosense \u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002Cosense \u306E\u30DA\u30FC\u30B8\u4E0A\u3067\u5B9F\u884C\u3057\u3066\u304F\u3060\u3055\u3044"
      );
    }
    return cosense;
  }
  var CosensePage = class {
    /**
     * UserScript API のグローバルオブジェクトを返す。
     * 2024年以降 window.cosense と window.scrapbox の両方に生えている
     *
     * @returns {any}
     */
    #cosense = getCosense();
    get isInPageView() {
      return this.#cosense.Layout === "page";
    }
    /**
     * @returns {{ text: string }[]}
     */
    get lines() {
      return this.#cosense.Page.lines;
    }
    /**
     * @param {string} title 
     * @param {string} image 
     * @param {() => void} onClick 
     */
    addMenu(title, image, onClick) {
      this.#cosense.PageMenu.addMenu({ title, image, onClick });
    }
    toPlotLines() {
      return toPlotLines(this.lines);
    }
  };
  function toPlotLines(rawLines) {
    return rawLines.slice(1).map((line, index) => {
      const indent = (line.text.match(INDENT_PATTERN) ?? [""])[0].length;
      return {
        text: line.text.slice(indent),
        indent,
        sourceLine: index + 1
      };
    });
  }

  // src/parse.js
  var PAGE_HEADING_PATTERN = /^(\d+)(?:-(\d+))?\.(?:\s+(.*))?$/;
  var AUTHOR_COMMENT_PATTERN = /^\[[^[\]]+\.icon\]/;
  var STRIKETHROUGH_PATTERN = /\[-[^\]]*\]/g;
  var BRACKETS = [
    { kind: "dialogue", open: "\u300C", close: "\u300D" },
    { kind: "narration", open: "\uFF3B", close: "\uFF3D" },
    { kind: "monologue", open: "\uFF08", close: "\uFF09" }
  ];
  function parsePlot(lines) {
    const pages = [];
    const warnings = [];
    let currentPage = null;
    const seenNumbers = /* @__PURE__ */ new Set();
    let expectedNumber = 1;
    lines.forEach((line, index) => {
      const sourceLine = line.sourceLine ?? index;
      const text = line.text.replace(STRIKETHROUGH_PATTERN, "").trim();
      if (text === "") {
        return;
      }
      if (AUTHOR_COMMENT_PATTERN.test(text)) {
        return;
      }
      const heading = line.indent === 0 ? text.match(PAGE_HEADING_PATTERN) : null;
      if (heading) {
        const page = createPage(heading);
        const numbers = pageNumbers(page);
        const duplicated = numbers.filter((number) => seenNumbers.has(number));
        if (duplicated.length > 0) {
          page.warnings.push(`\u30DA\u30FC\u30B8\u756A\u53F7 ${duplicated.join(", ")} \u304C\u91CD\u8907\u3057\u3066\u3044\u307E\u3059`);
        } else if (page.number > expectedNumber) {
          page.warnings.push(
            page.number - expectedNumber === 1 ? `\u30DA\u30FC\u30B8\u756A\u53F7 ${expectedNumber} \u304C\u6B20\u843D\u3057\u3066\u3044\u307E\u3059` : `\u30DA\u30FC\u30B8\u756A\u53F7 ${expectedNumber}\u301C${page.number - 1} \u304C\u6B20\u843D\u3057\u3066\u3044\u307E\u3059`
          );
        } else if (page.number < expectedNumber) {
          page.warnings.push(`\u30DA\u30FC\u30B8\u756A\u53F7 ${page.number} \u304C\u6607\u9806\u3067\u306F\u3042\u308A\u307E\u305B\u3093`);
        }
        for (const number of numbers) {
          seenNumbers.add(number);
        }
        expectedNumber = Math.max(expectedNumber, page.endNumber + 1);
        pages.push(page);
        currentPage = page;
        return;
      }
      if (!currentPage) {
        warnings.push(`\u30DA\u30FC\u30B8\u898B\u51FA\u3057\u3088\u308A\u524D\u306E\u884C\u3092\u7121\u8996\u3057\u307E\u3057\u305F: ${text}`);
        return;
      }
      const { items, notes } = classify(text, sourceLine);
      currentPage.items.push(...items);
      currentPage.notes.push(...notes);
    });
    return { pages, warnings };
  }
  function createPage(heading) {
    const number = Number(heading[1]);
    const label = heading[3] ?? "";
    const warnings = [];
    let endNumber = number;
    if (heading[2] !== void 0) {
      const rangeEnd = Number(heading[2]);
      if (rangeEnd <= number) {
        warnings.push(
          `\u898B\u958B\u304D\u306E\u7BC4\u56F2 ${number}-${rangeEnd} \u304C\u4E0D\u6B63\u306A\u306E\u3067 ${number} \u30DA\u30FC\u30B8\u76EE\u3068\u3057\u3066\u6271\u3044\u307E\u3059`
        );
      } else {
        endNumber = rangeEnd;
        const span = rangeEnd - number + 1;
        if (span > 2) {
          warnings.push(`\u898B\u958B\u304D ${number}-${rangeEnd} \u304C ${span} \u30DA\u30FC\u30B8\u306B\u307E\u305F\u304C\u3063\u3066\u3044\u307E\u3059`);
        }
        if (number % 2 === 1) {
          warnings.push(`\u898B\u958B\u304D ${number}-${rangeEnd} \u304C\u5947\u6570\u30DA\u30FC\u30B8\u304B\u3089\u59CB\u307E\u3063\u3066\u3044\u307E\u3059`);
        }
      }
    }
    return { number, endNumber, label, items: [], warnings, notes: [] };
  }
  function pageNumbers(page) {
    const numbers = [];
    for (let number = page.number; number <= page.endNumber; number += 1) {
      numbers.push(number);
    }
    return numbers;
  }
  function classify(text, sourceLine) {
    const split = splitSegments(text);
    if (!split) {
      return { items: [], notes: [] };
    }
    const items = split.segments.map(({ kind, text: text2 }) => ({ kind, text: text2, sourceLine }));
    const notes = [];
    const prefix = split.prefix.trim();
    if (prefix !== "") {
      notes.push(`\u62EC\u5F27\u306E\u524D\u306E\u300C${prefix}\u300D\u3092\u9664\u5916\u3057\u307E\u3057\u305F: ${text}`);
    }
    if (items.length > 1) {
      notes.push(`1\u884C\u3092${items.length}\u9805\u76EE\u306B\u5206\u5272\u3057\u307E\u3057\u305F: ${text}`);
    }
    return { items, notes };
  }
  function splitSegments(text) {
    const chars = Array.from(text);
    const segments = [];
    const stack = [];
    let prefix = "";
    let trailing = "";
    let segmentStart = 0;
    for (let i = 0; i < chars.length; i += 1) {
      const char = chars[i];
      const opener = BRACKETS.find((bracket) => bracket.open === char);
      const closer = BRACKETS.find((bracket) => bracket.close === char);
      if (stack.length === 0) {
        if (opener) {
          if (trailing.trim() !== "") return null;
          stack.push(opener);
          segmentStart = i + 1;
        } else if (closer) {
          return null;
        } else if (segments.length === 0) {
          prefix += char;
        } else {
          trailing += char;
        }
        continue;
      }
      if (opener) {
        stack.push(opener);
      } else if (closer) {
        if (stack[stack.length - 1] !== closer) return null;
        stack.pop();
        if (stack.length === 0) {
          segments.push({ kind: closer.kind, text: chars.slice(segmentStart, i).join("") });
          trailing = "";
        }
      }
    }
    if (stack.length > 0 || segments.length === 0 || trailing.trim() !== "") {
      return null;
    }
    return { prefix, segments };
  }

  // src/format.js
  function formatPage(page) {
    return page.items.map((item) => item.text).join("\n\n");
  }
  function createManifest(result, options = {}) {
    return {
      schema: "cosense-to-clipstudio/manifest",
      version: 1,
      source: { ...options.source },
      pageCount: result.pages.length,
      pages: result.pages.map((page) => ({
        number: page.number,
        endNumber: page.endNumber,
        label: page.label,
        items: page.items.map(({ kind, text, sourceLine }) => ({ kind, text, sourceLine })),
        warnings: [...page.warnings],
        notes: [...page.notes]
      })),
      warnings: [...result.warnings],
      ...options.documentSettings === void 0 ? {} : {
        documentSettings: { ...options.documentSettings }
      }
    };
  }
  function formatManifest(result, options = {}) {
    return JSON.stringify(createManifest(result, options), null, 2);
  }

  // src/ui.js
  var KIND_LABELS = {
    dialogue: "\u30BB\u30EA\u30D5",
    narration: "\u30CA\u30EC\u30FC\u30B7\u30E7\u30F3",
    monologue: "\u30E2\u30CE\u30ED\u30FC\u30B0"
  };
  var CSS = `
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
.ctcs-warnings li::before { content: "\u26A0 "; }
.ctcs-notes {
  margin: 0 0 12px; padding: 8px 12px;
  background: #e7f1ff; border: 1px solid #b6d4fe; border-radius: 4px;
  color: #084298; list-style: none;
}
.ctcs-notes li::before { content: "\u2139 "; }
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
`;
  var TAG_NAME = "ctcs-modal";
  var ClipStudioExportModal = class extends HTMLElement {
    /** @type {import("./types.js").ParseResult} */
    #result = { pages: [], warnings: [] };
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
    #render() {
      const result = this.#result;
      const manifestJSON = formatManifest(result, this.#options);
      const dialog = this.#dialog;
      dialog.replaceChildren();
      const header = el("div", "ctcs-header");
      const title = el("h2");
      title.textContent = "CLIPSTUDIO\u7528\u306B\u51FA\u529B";
      const closeButton = el("button", "ctcs-close");
      closeButton.textContent = "\xD7";
      closeButton.addEventListener("click", () => this.close());
      header.append(title, closeButton);
      dialog.appendChild(header);
      const exportBar = el("div", "ctcs-footer");
      const copyJSON = el("button");
      copyJSON.textContent = "Computer Use\u7528JSON\u3092\u30B3\u30D4\u30FC";
      const status = el("span", "ctcs-position");
      status.setAttribute("role", "status");
      copyJSON.addEventListener("click", async () => {
        const ok = await copyText(manifestJSON);
        status.textContent = ok ? "\u4F5C\u54C1\u5168\u4F53\u306EJSON\u3092\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F \u2713" : "\u30B3\u30D4\u30FC\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002JSON\u3092\u66F8\u304D\u51FA\u3057\u3066\u5229\u7528\u3057\u3066\u304F\u3060\u3055\u3044";
      });
      const downloadJSON = el("button");
      downloadJSON.textContent = "Computer Use\u7528JSON\u3092\u66F8\u304D\u51FA\u3059";
      downloadJSON.addEventListener("click", () => {
        try {
          downloadManifest(manifestJSON);
          status.textContent = "\u4F5C\u54C1\u5168\u4F53\u306EJSON\u306E\u66F8\u304D\u51FA\u3057\u3092\u958B\u59CB\u3057\u307E\u3057\u305F";
        } catch {
          status.textContent = "\u66F8\u304D\u51FA\u3057\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002JSON\u30B3\u30D4\u30FC\u3092\u304A\u8A66\u3057\u304F\u3060\u3055\u3044";
        }
      });
      exportBar.append(copyJSON, downloadJSON, status);
      dialog.appendChild(exportBar);
      const body = el("div", "ctcs-body");
      dialog.appendChild(body);
      if (result.pages.length === 0) {
        const empty = el("p", "ctcs-empty");
        empty.textContent = "\u30DA\u30FC\u30B8\u898B\u51FA\u3057\uFF08\u30A4\u30F3\u30C7\u30F3\u30C80\u306E\u300C1.\u300D\u300C2.\u300D\u2026\uFF09\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F";
        body.appendChild(empty);
        appendWarnings(body, result.warnings);
        return;
      }
      const page = result.pages[this.#index];
      const pageTitle = el("h3", "ctcs-page-title");
      const range = page.endNumber > page.number ? `${page.number}-${page.endNumber}\u30DA\u30FC\u30B8\u76EE\uFF08\u898B\u958B\u304D\uFF09` : `${page.number}\u30DA\u30FC\u30B8\u76EE`;
      pageTitle.textContent = page.label ? `${range} \u2014 ${page.label}` : range;
      body.appendChild(pageTitle);
      appendWarnings(body, [...result.warnings, ...page.warnings]);
      appendNotes(body, page.notes);
      if (page.items.length === 0) {
        const empty = el("p", "ctcs-empty");
        empty.textContent = "\u62BD\u51FA\u9805\u76EE\u306F\u3042\u308A\u307E\u305B\u3093\uFF080\u4EF6\uFF09";
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
      prev.textContent = "\u2190 \u524D\u30DA\u30FC\u30B8";
      prev.disabled = this.#index === 0;
      prev.addEventListener("click", () => {
        this.#index -= 1;
        this.#render();
      });
      const position = el("span", "ctcs-position");
      position.textContent = `${this.#index + 1} / ${result.pages.length}`;
      const copy = el("button", "ctcs-copy");
      copy.textContent = "\u3053\u306E\u30DA\u30FC\u30B8\u3092\u30B3\u30D4\u30FC";
      copy.disabled = page.items.length === 0;
      copy.addEventListener("click", async () => {
        const ok = await copyText(formatPage(page));
        copy.textContent = ok ? "\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F \u2713" : "\u30B3\u30D4\u30FC\u306B\u5931\u6557\u3057\u307E\u3057\u305F";
        setTimeout(() => {
          copy.textContent = "\u3053\u306E\u30DA\u30FC\u30B8\u3092\u30B3\u30D4\u30FC";
        }, 1500);
      });
      const next = el("button");
      next.textContent = "\u6B21\u30DA\u30FC\u30B8 \u2192";
      next.disabled = this.#index === result.pages.length - 1;
      next.addEventListener("click", () => {
        this.#index += 1;
        this.#render();
      });
      footer.append(prev, position, copy, next);
      dialog.appendChild(footer);
    }
  };
  if (!customElements.get(TAG_NAME)) {
    customElements.define(TAG_NAME, ClipStudioExportModal);
  }
  function openModal(result, options = {}) {
    const modal = (
      /** @type {ClipStudioExportModal} */
      document.createElement(TAG_NAME)
    );
    modal.result = result;
    modal.options = options;
    document.body.appendChild(modal);
    return modal;
  }
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
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
  function appendWarnings(parent, warnings) {
    appendMessages(parent, "ctcs-warnings", warnings);
  }
  function appendNotes(parent, notes) {
    appendMessages(parent, "ctcs-notes", notes);
  }
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
  function el(tag, className) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    return element;
  }
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
      setTimeout(() => URL.revokeObjectURL(url), 1e3);
    }
  }

  // src/index.js
  var ICON = "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#37474f"/><text x="16" y="21" font-family="sans-serif" font-size="11" font-weight="bold" fill="#fff" text-anchor="middle">CSP</text></svg>`
  );
  function main() {
    const cosensePage = new CosensePage();
    cosensePage.addMenu(
      "CLIPSTUDIO\u7528\u306B\u51FA\u529B",
      ICON,
      () => {
        if (!cosensePage.isInPageView) {
          alert("\u30DA\u30FC\u30B8\u3092\u958B\u3044\u305F\u72B6\u614B\u3067\u5B9F\u884C\u3057\u3066\u304F\u3060\u3055\u3044");
          return;
        }
        const result = parsePlot(cosensePage.toPlotLines());
        openModal(result, {
          source: {
            title: cosensePage.lines[0]?.text,
            url: window.location.href
          }
        });
      }
    );
  }
  main();
})();
