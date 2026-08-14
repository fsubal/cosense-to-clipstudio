import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePlot } from "../src/parse.js";

/** 設計メモの入力例そのまま */
const example = [
  { text: "1.", indent: 0 },
  { text: "「セリフはこう入れる」", indent: 1 },
  { text: "[fsubal.icon] 作者コメントはこう。出力しない", indent: 2 },
  { text: "［四角い吹き出しに入れるナレーションはこう］", indent: 1 },
  { text: "（丸ゴシックのモノローグはこう）", indent: 1 },
  { text: "2.", indent: 0 },
  { text: "[fsubal.icon] ここから2ページ目", indent: 1 },
];

test("入力例が期待する2ページへ変換される", () => {
  const { pages, warnings } = parsePlot(example);

  assert.equal(pages.length, 2);
  assert.deepEqual(warnings, []);

  assert.equal(pages[0].number, 1);
  assert.deepEqual(
    pages[0].items.map(({ kind, text }) => ({ kind, text })),
    [
      { kind: "dialogue", text: "セリフはこう入れる" },
      { kind: "narration", text: "四角い吹き出しに入れるナレーションはこう" },
      { kind: "monologue", text: "丸ゴシックのモノローグはこう" },
    ],
  );
  assert.deepEqual(pages[0].warnings, []);

  assert.equal(pages[1].number, 2);
  assert.deepEqual(pages[1].items, []);
  assert.deepEqual(pages[1].warnings, []);
});

test("sourceLine には入力の行番号が入る", () => {
  const { pages } = parsePlot(example);
  assert.deepEqual(
    pages[0].items.map((item) => item.sourceLine),
    [1, 3, 4],
  );
});

test("ページ見出しの後ろにシーン名を書ける", () => {
  const { pages } = parsePlot([
    { text: "1. 通勤のシーン", indent: 0 },
    { text: "「おはよう」", indent: 1 },
  ]);
  assert.equal(pages[0].number, 1);
  assert.equal(pages[0].label, "通勤のシーン");
  assert.equal(pages[0].items[0].text, "おはよう");
});

test("インデントされた 1. はページ見出しにならない", () => {
  const { pages } = parsePlot([
    { text: "1.", indent: 0 },
    { text: "2.", indent: 1 },
  ]);
  assert.equal(pages.length, 1);
});

test("括弧で囲まれていないト書きは出力しない", () => {
  const { pages, warnings } = parsePlot([
    { text: "1.", indent: 0 },
    { text: "主人公が歩いている", indent: 1 },
    { text: "「セリフ」のあとにト書きが続く行", indent: 1 },
  ]);
  assert.deepEqual(pages[0].items, []);
  assert.deepEqual(warnings, []);
});

test("ページ見出しより前のテキストは警告になる", () => {
  const { pages, warnings } = parsePlot([
    { text: "「はぐれたセリフ」", indent: 1 },
    { text: "1.", indent: 0 },
  ]);
  assert.equal(pages.length, 1);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /ページ見出しより前/);
});

test("ページ番号の重複は警告になる", () => {
  const { pages } = parsePlot([
    { text: "1.", indent: 0 },
    { text: "2.", indent: 0 },
    { text: "2.", indent: 0 },
  ]);
  assert.equal(pages.length, 3);
  assert.match(pages[2].warnings[0], /重複/);
});

test("ページ番号の欠落は警告になる", () => {
  const { pages } = parsePlot([
    { text: "1.", indent: 0 },
    { text: "4.", indent: 0 },
  ]);
  assert.match(pages[1].warnings[0], /2〜3 が欠落/);
});

test("1ページだけの欠落は単数で警告される", () => {
  const { pages } = parsePlot([
    { text: "1.", indent: 0 },
    { text: "3.", indent: 0 },
  ]);
  assert.match(pages[1].warnings[0], /2 が欠落/);
});

test("ページ番号が昇順でない場合は警告になる", () => {
  const { pages } = parsePlot([
    { text: "2.", indent: 0 },
    { text: "1.", indent: 0 },
  ]);
  // 最初の見出しが 2 なので 1 の欠落も報告される
  assert.match(pages[0].warnings[0], /1 が欠落/);
  assert.match(pages[1].warnings[0], /昇順ではありません/);
});

test("誰のアイコンでも作者コメントとして除外される", () => {
  const { pages } = parsePlot([
    { text: "1.", indent: 0 },
    { text: "[someone.icon] コメント", indent: 1 },
    { text: "[fsubal.icon][fsubal.icon] 連打コメント", indent: 1 },
  ]);
  assert.deepEqual(pages[0].items, []);
});

test("空行は無視される", () => {
  const { pages, warnings } = parsePlot([
    { text: "", indent: 0 },
    { text: "1.", indent: 0 },
    { text: "", indent: 1 },
  ]);
  assert.equal(pages.length, 1);
  assert.deepEqual(warnings, []);
});
