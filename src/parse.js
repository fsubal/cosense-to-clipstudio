/**
 * プロット解析のコア。DOM や window.cosense には依存せず、
 * 文字列とインデントの配列（PlotLine[]）だけを入力に取る
 */

/**
 * インデント0で `1.` `2. 通勤のシーン` のような行をページ見出しとみなす。
 * `2-3. 部屋全体が映る見開き` のように `開始-終了.` と書くと見開き（複数ページにまたがる区切り）
 */
const PAGE_HEADING_PATTERN = /^(\d+)(?:-(\d+))?\.(?:\s+(.*))?$/;

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
      const page = createPage(heading);
      const numbers = pageNumbers(page);

      const duplicated = numbers.filter((number) => seenNumbers.has(number));
      if (duplicated.length > 0) {
        page.warnings.push(`ページ番号 ${duplicated.join(", ")} が重複しています`);
      } else if (page.number > expectedNumber) {
        page.warnings.push(
          page.number - expectedNumber === 1
            ? `ページ番号 ${expectedNumber} が欠落しています`
            : `ページ番号 ${expectedNumber}〜${page.number - 1} が欠落しています`,
        );
      } else if (page.number < expectedNumber) {
        page.warnings.push(`ページ番号 ${page.number} が昇順ではありません`);
      }

      for (const number of numbers) {
        seenNumbers.add(number);
      }
      expectedNumber = Math.max(expectedNumber, page.endNumber + 1);
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
 * ページ見出しのマッチ結果から空のページを作る。
 * 見開き（`2-3.`）の範囲が不正なら警告を付けて開始ページだけの区切りとして扱う
 *
 * @param {RegExpMatchArray} heading
 * @returns {import("./types.js").PlotPage}
 */
function createPage(heading) {
  const number = Number(heading[1]);
  const label = heading[3] ?? "";
  /** @type {string[]} */
  const warnings = [];
  let endNumber = number;

  if (heading[2] !== undefined) {
    const rangeEnd = Number(heading[2]);
    if (rangeEnd <= number) {
      warnings.push(
        `見開きの範囲 ${number}-${rangeEnd} が不正なので ${number} ページ目として扱います`,
      );
    } else {
      endNumber = rangeEnd;
      const span = rangeEnd - number + 1;
      if (span > 2) {
        warnings.push(`見開き ${number}-${rangeEnd} が ${span} ページにまたがっています`);
      }
    }
  }

  return { number, endNumber, label, items: [], warnings };
}

/**
 * ページ区切りが含むページ番号の一覧。単ページなら1要素、見開きなら範囲内の全番号
 *
 * @param {import("./types.js").PlotPage} page
 * @returns {number[]}
 */
function pageNumbers(page) {
  const numbers = [];
  for (let number = page.number; number <= page.endNumber; number += 1) {
    numbers.push(number);
  }
  return numbers;
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
