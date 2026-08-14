/**
 * Cosense (Scrapbox) 依存部分。
 * window.cosense / window.scrapbox の取得と、
 * cosense.Page.lines からパーサー入力への変換だけを担当する
 */

/**
 * Cosense の行テキストは行頭の空白文字（半角スペース・タブ・全角スペース）が
 * そのままインデントを表す
 */
const INDENT_PATTERN = /^[ \t　]*/;

/**
 * UserScript API のグローバルオブジェクトを返す。
 * 2024年以降 window.cosense と window.scrapbox の両方に生えている
 *
 * @returns {any}
 */
export function getCosense() {
  const cosense =
    /** @type {any} */ (globalThis).cosense ??
    /** @type {any} */ (globalThis).scrapbox;
  if (!cosense) {
    throw new Error(
      "window.cosense が見つかりません。Cosense のページ上で実行してください",
    );
  }
  return cosense;
}

/**
 * cosense.Page.lines をパーサー入力（PlotLine[]）へ変換する。
 * 先頭の1行はページタイトルなので除外し、
 * sourceLine には元の行番号（タイトル行 = 0）を保持する
 *
 * @param {{ text: string }[]} rawLines
 * @returns {import("./types.js").PlotLine[]}
 */
export function toPlotLines(rawLines) {
  return rawLines.slice(1).map((line, index) => {
    const indent = (line.text.match(INDENT_PATTERN) ?? [""])[0].length;
    return {
      text: line.text.slice(indent),
      indent,
      sourceLine: index + 1,
    };
  });
}
