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

function getCosense() {
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
 * window.cosense が any なので、外部に any が漏れ出さないようにするためのクラス
 */
export class CosensePage {
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
   * @returns {import("./types.js").CosenseLine[]}
   */
  get lines() {
    return this.#cosense.Page.lines;
  }

  /** @returns {string | undefined} */
  get projectName() {
    const name = this.#cosense.Project?.name;
    return typeof name === "string" ? name : undefined;
  }

  /** @returns {string | undefined} */
  get pageId() {
    const id = this.#cosense.Page?.id;
    return typeof id === "string" ? id : undefined;
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
}

/**
 * cosense.Page.lines をパーサー入力（PlotLine[]）へ変換する。
 * 先頭の1行はページタイトルなので除外し、
 * sourceLine には元の行番号（タイトル行 = 0）を保持する。
 * 行 ID と更新時刻はあればそのまま通す（変更の追跡に使う）
 *
 * @param {import("./types.js").CosenseLine[]} rawLines
 * @returns {import("./types.js").PlotLine[]}
 */
export function toPlotLines(rawLines) {
  return rawLines.slice(1).map((line, index) => {
    const indent = (line.text.match(INDENT_PATTERN) ?? [""])[0].length;
    return {
      text: line.text.slice(indent),
      indent,
      sourceLine: index + 1,
      ...(line.id === undefined ? {} : { id: line.id }),
      ...(line.updated === undefined ? {} : { updated: line.updated }),
    };
  });
}
