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

/**
 * 行の中で本文を囲む括弧の対。行の最上位で閉じた括弧ごとに1項目になる
 * @type {{ kind: import("./types.js").TextKind, open: string, close: string }[]}
 */
const BRACKETS = [
  { kind: "dialogue", open: "「", close: "」" },
  { kind: "narration", open: "［", close: "］" },
  { kind: "monologue", open: "（", close: "）" },
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

    if (!currentPage) {
      // ページ見出しより前の行。ト書きであっても構造の崩れなので知らせる
      warnings.push(`ページ見出しより前の行を無視しました: ${text}`);
      return;
    }

    // 括弧で囲まれた部分が無い行はト書きとして出力しない（items が空）
    const { items, notes } = classify(text, sourceLine);
    currentPage.items.push(...items);
    currentPage.notes.push(...notes);
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
      // 右綴じの漫画では見開きは偶数ページから始まる（2-3, 4-5, …）。
      // 綴じ方や開始ページの設定次第なのでエラーにはせず、見開きとして扱いつつ知らせる
      if (number % 2 === 1) {
        warnings.push(`見開き ${number}-${rangeEnd} が奇数ページから始まっています`);
      }
    }
  }

  return { number, endNumber, label, items: [], warnings, notes: [] };
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
 * 1行を括弧ごとのテキスト項目に分解する。
 * 括弧で囲まれた部分が無い行や、括弧の後ろに地の文が続く行はト書きとして空配列を返す。
 * 最初の括弧より前の地の文（書き文字・話者名）は出力せず、除外したことを notes で知らせる
 *
 * @param {string} text
 * @param {number} sourceLine
 * @returns {{ items: import("./types.js").PlotItem[], notes: string[] }}
 */
function classify(text, sourceLine) {
  const split = splitSegments(text);
  if (!split) {
    return { items: [], notes: [] };
  }

  const items = split.segments.map(({ kind, text }) => ({ kind, text, sourceLine }));
  /** @type {string[]} */
  const notes = [];
  const prefix = split.prefix.trim();
  if (prefix !== "") {
    notes.push(`括弧の前の「${prefix}」を除外しました: ${text}`);
  }
  if (items.length > 1) {
    notes.push(`1行を${items.length}項目に分割しました: ${text}`);
  }
  return { items, notes };
}

/**
 * 行を「最上位で閉じた括弧の並び」と「最初の括弧より前の地の文」に分ける。
 * 括弧の内側の括弧は本文の一部として残す。
 *
 * 次の場合は括弧の並びとして解釈できないので null を返す（行全体がト書き）
 * - 括弧の対応が取れない（閉じ忘れ・種類の不一致・深さ0での閉じ括弧）
 * - 括弧で囲まれた部分が1つも無い
 * - 括弧の間や後ろに空白以外の地の文がある
 *
 * @param {string} text
 * @returns {{ prefix: string, segments: { kind: import("./types.js").TextKind, text: string }[] } | null}
 */
function splitSegments(text) {
  const chars = Array.from(text);
  /** @type {{ kind: import("./types.js").TextKind, text: string }[]} */
  const segments = [];
  /** @type {(typeof BRACKETS)[number][]} */
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
