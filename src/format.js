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
