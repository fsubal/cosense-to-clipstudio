/**
 * @typedef {"dialogue" | "narration" | "monologue"} TextKind
 */

/**
 * 抽出されたテキスト1項目
 *
 * @typedef {object} PlotItem
 * @property {TextKind} kind
 * @property {string} text 括弧を外したあとの本文
 * @property {number} sourceLine 元ページでの行番号（タイトル行を 0 とする 0 始まり）
 */

/**
 * 1ページ分のプロット
 *
 * @typedef {object} PlotPage
 * @property {number} number ページ番号
 * @property {string} label ページ見出しの補足（`1. 通勤のシーン` の「通勤のシーン」部分。無ければ空文字）
 * @property {PlotItem[]} items
 * @property {string[]} warnings このページに紐づく警告
 */

/**
 * パーサーへの入力1行。Cosense 依存を持たない
 *
 * @typedef {object} PlotLine
 * @property {string} text インデントを除いた本文
 * @property {number} indent インデントの深さ
 * @property {number} [sourceLine] 元ページでの行番号。省略時は配列の添字
 */

/**
 * @typedef {object} ParseResult
 * @property {PlotPage[]} pages
 * @property {string[]} warnings 特定のページに紐づかない警告
 */

export {};
