/**
 * CLIP STUDIO PAINT のストーリーエディター向けテキスト生成。
 * ストーリーエディターは空行区切りのプレーンテキストを
 * 1テキスト項目ずつに分けて取り込むので、それに合わせる
 */

/**
 * 半角英数字（0-9 A-Z a-z）を全角に置き換える。
 * 漫画のセリフは縦書きが普通で、縦書きでは英数字も全角にすることが多いため。
 * 記号・空白・すでに全角の文字はそのまま。二桁数字の縦中横は扱わない
 *
 * @param {string} text
 * @returns {string}
 */
export function toFullWidthAlnum(text) {
  return text.replace(/[0-9A-Za-z]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) + 0xfee0),
  );
}

/**
 * @param {string} text
 * @param {import("./types.js").FormatOptions} options
 * @returns {string}
 */
function transformText(text, options) {
  return options.fullWidth ? toFullWidthAlnum(text) : text;
}

/**
 * @param {import("./types.js").PlotPage} page
 * @param {import("./types.js").FormatOptions} [options]
 * @returns {string} クリップボードへ入れるテキスト
 */
export function formatPage(page, options = {}) {
  return page.items.map((item) => transformText(item.text, options)).join("\n\n");
}

/**
 * Computer Use向けの中間表現。番号・順序・警告を補正せず保持する。
 * `options.fullWidth` のときだけ本文の半角英数字を全角にし、トップレベルに `fullWidth: true` を記録する。
 * 入力とは参照を共有しないスナップショットを返す。
 * @param {import("./types.js").ParseResult} result
 * @param {import("./types.js").ManifestOptions} [options]
 * @returns {import("./types.js").ComputerUseManifest}
 */
export function createManifest(result, options = {}) {
  return {
    schema: "cosense-to-clipstudio/manifest",
    version: 1,
    source: { ...options.source },
    pageCount: result.pages.length,
    pages: result.pages.map((page) => ({
      number: page.number,
      endNumber: page.endNumber,
      label: page.label,
      items: page.items.map(({ kind, text, sourceLine }) => ({
        kind,
        text: transformText(text, options),
        sourceLine,
      })),
      warnings: [...page.warnings],
      notes: [...page.notes],
    })),
    warnings: [...result.warnings],
    ...(options.fullWidth ? { fullWidth: true } : {}),
    ...(options.documentSettings === undefined ? {} : {
      documentSettings: { ...options.documentSettings },
    }),
  };
}

/**
 * @param {import("./types.js").ParseResult} result
 * @param {import("./types.js").ManifestOptions} [options]
 * @returns {string}
 */
export function formatManifest(result, options = {}) {
  return JSON.stringify(createManifest(result, options), null, 2);
}
