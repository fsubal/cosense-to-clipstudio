/**
 * CLIP STUDIO PAINT のストーリーエディター向けテキスト生成。
 * ストーリーエディターは空行区切りのプレーンテキストを
 * 1テキスト項目ずつに分けて取り込むので、それに合わせる
 */

/**
 * @param {import("./types.js").PlotPage} page
 * @returns {string} クリップボードへ入れるテキスト
 */
export function formatPage(page) {
  return page.items.map((item) => item.text).join("\n\n");
}

/**
 * Computer Use向けの中間表現。番号・順序・警告を補正せず保持する。
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
      label: page.label,
      items: page.items.map(({ kind, text, sourceLine }) => ({ kind, text, sourceLine })),
      warnings: [...page.warnings],
    })),
    warnings: [...result.warnings],
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
