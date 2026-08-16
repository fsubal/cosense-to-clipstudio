/**
 * プロット解析のコア。DOM や window.cosense には依存せず、
 * 文字列とインデントの配列（PlotLine[]）だけを入力に取る
 */

/** インデント0で `1.` `2. 通勤のシーン` のような行をページ見出しとみなす */
const PAGE_HEADING_PATTERN = /^(\d+)\.(?:\s+(.*))?$/;

/** `[fsubal.icon]` のようなプロフィールアイコンから始まる行は作者コメント */
const AUTHOR_COMMENT_PATTERN = /^\[[^[\]]+\.icon\]/;

/** `[- 取り消し線]` の記法（`[-* ...]` などの複合装飾も含む）は無かったものとして扱う */
const STRIKETHROUGH_PATTERN = /\[-[^\]]*\]/g;

/** @type {{ kind: import("./types.js").TextKind, pattern: RegExp }[]} */
const KIND_PATTERNS = [
  { kind: "dialogue", pattern: /^「([\s\S]*)」$/ },
  { kind: "narration", pattern: /^［([\s\S]*)］$/ },
  { kind: "monologue", pattern: /^（([\s\S]*)）$/ },
];

/**
 * @param {import("./types.js").PlotLine[]} lines
 * @returns {import("./types.js").ParseResult}
 */
export function parsePlot(lines) {
  /** @type {import("./types.js").PlotPage[]} */
  const pages = [];
  /** @type {string[]} */
  const warnings = [];

  /** @type {import("./types.js").PlotPage | null} */
  let currentPage = null;
  /** @type {Set<number>} */
  const seenNumbers = new Set();
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
      const number = Number(heading[1]);
      /** @type {import("./types.js").PlotPage} */
      const page = {
        number,
        label: heading[2] ?? "",
        items: [],
        warnings: [],
      };

      if (seenNumbers.has(number)) {
        page.warnings.push(`ページ番号 ${number} が重複しています`);
      } else if (number > expectedNumber) {
        page.warnings.push(
          number - expectedNumber === 1
            ? `ページ番号 ${expectedNumber} が欠落しています`
            : `ページ番号 ${expectedNumber}〜${number - 1} が欠落しています`,
        );
      } else if (number < expectedNumber) {
        page.warnings.push(`ページ番号 ${number} が昇順ではありません`);
      }

      seenNumbers.add(number);
      expectedNumber = Math.max(expectedNumber, number + 1);
      pages.push(page);
      currentPage = page;
      return;
    }

    const item = classify(text, sourceLine);

    if (!currentPage) {
      // ページ見出しより前の行。ト書きであっても構造の崩れなので知らせる
      warnings.push(`ページ見出しより前の行を無視しました: ${text}`);
      return;
    }

    if (item) {
      currentPage.items.push(item);
    }
    // 括弧で囲まれていない行はト書きとして出力しない
  });

  return { pages, warnings };
}

/**
 * 行全体を囲む括弧の種類からテキスト種別を判定する。
 * どの括弧でも囲まれていなければ null（ト書き）
 *
 * @param {string} text
 * @param {number} sourceLine
 * @returns {import("./types.js").PlotItem | null}
 */
function classify(text, sourceLine) {
  for (const { kind, pattern } of KIND_PATTERNS) {
    const matched = text.match(pattern);
    if (matched) {
      return { kind, text: matched[1], sourceLine };
    }
  }
  return null;
}
