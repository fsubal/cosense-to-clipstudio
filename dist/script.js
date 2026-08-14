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
  var PAGE_HEADING_PATTERN = /^(\d+)\.(?:\s+(.*))?$/;
  var AUTHOR_COMMENT_PATTERN = /^\[[^[\]]+\.icon\]/;
  var KIND_PATTERNS = [
    { kind: "dialogue", pattern: /^「([\s\S]*)」$/ },
    { kind: "narration", pattern: /^［([\s\S]*)］$/ },
    { kind: "monologue", pattern: /^（([\s\S]*)）$/ }
  ];
  function parsePlot(lines) {
    const pages = [];
    const warnings = [];
    let currentPage = null;
    const seenNumbers = /* @__PURE__ */ new Set();
    let expectedNumber = 1;
    lines.forEach((line, index) => {
      const sourceLine = line.sourceLine ?? index;
      const text = line.text.trim();
      if (text === "") {
        return;
      }
      if (AUTHOR_COMMENT_PATTERN.test(text)) {
        return;
      }
      const heading = line.indent === 0 ? text.match(PAGE_HEADING_PATTERN) : null;
      if (heading) {
        const number = Number(heading[1]);
        const page = {
          number,
          label: heading[2] ?? "",
          items: [],
          warnings: []
        };
        if (seenNumbers.has(number)) {
          page.warnings.push(`\u30DA\u30FC\u30B8\u756A\u53F7 ${number} \u304C\u91CD\u8907\u3057\u3066\u3044\u307E\u3059`);
        } else if (number > expectedNumber) {
          page.warnings.push(
            number - expectedNumber === 1 ? `\u30DA\u30FC\u30B8\u756A\u53F7 ${expectedNumber} \u304C\u6B20\u843D\u3057\u3066\u3044\u307E\u3059` : `\u30DA\u30FC\u30B8\u756A\u53F7 ${expectedNumber}\u301C${number - 1} \u304C\u6B20\u843D\u3057\u3066\u3044\u307E\u3059`
          );
        } else if (number < expectedNumber) {
          page.warnings.push(`\u30DA\u30FC\u30B8\u756A\u53F7 ${number} \u304C\u6607\u9806\u3067\u306F\u3042\u308A\u307E\u305B\u3093`);
        }
        seenNumbers.add(number);
        expectedNumber = Math.max(expectedNumber, number + 1);
        pages.push(page);
        currentPage = page;
        return;
      }
      const item = classify(text, sourceLine);
      if (!currentPage) {
        warnings.push(`\u30DA\u30FC\u30B8\u898B\u51FA\u3057\u3088\u308A\u524D\u306E\u884C\u3092\u7121\u8996\u3057\u307E\u3057\u305F: ${text}`);
        return;
      }
      if (item) {
        currentPage.items.push(item);
      }
    });
    return { pages, warnings };
  }
  function classify(text, sourceLine) {
    for (const { kind, pattern } of KIND_PATTERNS) {
      const matched = text.match(pattern);
      if (matched) {
        return { kind, text: matched[1], sourceLine };
      }
    }
    return null;
  }

  // src/format.js
  function formatPage(page) {
    return page.items.map((item) => item.text).join("\n\n");
  }

  // src/ui.js
  var KIND_LABELS = {
    dialogue: "\u30BB\u30EA\u30D5",
    narration: "\u30CA\u30EC\u30FC\u30B7\u30E7\u30F3",
    monologue: "\u30E2\u30CE\u30ED\u30FC\u30B0"
  };
  var STYLE_ID = "ctcs-style";
  var CSS = `
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
.ctcs-warnings li::before { content: "\u26A0 "; }
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
  function openModal(result) {
    injectStyle();
    let index = 0;
    const overlay = el("div", "ctcs-overlay");
    const modal = el("div", "ctcs-modal");
    overlay.appendChild(modal);
    const close = () => {
      overlay.remove();
      document.removeEventListener("keydown", onKeydown);
    };
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
      title.textContent = "CLIPSTUDIO\u7528\u306B\u51FA\u529B";
      const closeButton = el("button", "ctcs-close");
      closeButton.textContent = "\xD7";
      closeButton.addEventListener("click", close);
      header.append(title, closeButton);
      modal.appendChild(header);
      const body = el("div", "ctcs-body");
      modal.appendChild(body);
      if (result.pages.length === 0) {
        const empty = el("p", "ctcs-empty");
        empty.textContent = "\u30DA\u30FC\u30B8\u898B\u51FA\u3057\uFF08\u30A4\u30F3\u30C7\u30F3\u30C80\u306E\u300C1.\u300D\u300C2.\u300D\u2026\uFF09\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F";
        body.appendChild(empty);
        appendWarnings(body, result.warnings);
        return;
      }
      const page = result.pages[index];
      const pageTitle = el("h3", "ctcs-page-title");
      pageTitle.textContent = page.label ? `${page.number}\u30DA\u30FC\u30B8\u76EE \u2014 ${page.label}` : `${page.number}\u30DA\u30FC\u30B8\u76EE`;
      body.appendChild(pageTitle);
      appendWarnings(body, [...result.warnings, ...page.warnings]);
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
      prev.disabled = index === 0;
      prev.addEventListener("click", () => {
        index -= 1;
        render();
      });
      const position = el("span", "ctcs-position");
      position.textContent = `${index + 1} / ${result.pages.length}`;
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
      const ok = document.execCommand("copy");
      textarea.remove();
      return ok;
    }
  }
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

  // src/index.js
  var ICON = "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#37474f"/><text x="16" y="21" font-family="sans-serif" font-size="11" font-weight="bold" fill="#fff" text-anchor="middle">CSP</text></svg>`
  );
  function main() {
    const cosense = getCosense();
    cosense.PageMenu.addMenu({
      title: "CLIPSTUDIO\u7528\u306B\u51FA\u529B",
      image: ICON,
      onClick: () => {
        if (cosense.Layout !== "page") {
          alert("\u30DA\u30FC\u30B8\u3092\u958B\u3044\u305F\u72B6\u614B\u3067\u5B9F\u884C\u3057\u3066\u304F\u3060\u3055\u3044");
          return;
        }
        const result = parsePlot(toPlotLines(cosense.Page.lines));
        openModal(result);
      }
    });
  }
  main();
})();
