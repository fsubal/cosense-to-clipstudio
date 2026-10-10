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

test("行全体が取り消し線の行は出力されない", () => {
  const { pages, warnings } = parsePlot([
    { text: "[- 「ボツにしたセリフ」]", indent: 1 },
    { text: "1.", indent: 0 },
    { text: "[- ［ボツにしたナレーション］]", indent: 1 },
  ]);
  assert.deepEqual(pages[0].items, []);
  // 取り消し済みの行は見出し前にあっても警告しない
  assert.deepEqual(warnings, []);
});

test("行の一部の取り消し線は除去して出力される", () => {
  const { pages } = parsePlot([
    { text: "1.", indent: 0 },
    { text: "「セリフ[- を書き直す前の部分]はこう入れる」", indent: 1 },
  ]);
  assert.deepEqual(
    pages[0].items.map(({ kind, text }) => ({ kind, text })),
    [{ kind: "dialogue", text: "セリフはこう入れる" }],
  );
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

test("`2-3.` は2ページ目と3ページ目にまたがる見開きになる", () => {
  const { pages, warnings } = parsePlot([
    { text: "1.", indent: 0 },
    { text: "2-3. 部屋全体が映る見開き", indent: 0 },
    { text: "「広い部屋だ」", indent: 1 },
    { text: "4.", indent: 0 },
  ]);
  assert.deepEqual(warnings, []);
  assert.deepEqual(
    pages.map(({ number, endNumber, label, warnings }) => ({ number, endNumber, label, warnings })),
    [
      { number: 1, endNumber: 1, label: "", warnings: [] },
      { number: 2, endNumber: 3, label: "部屋全体が映る見開き", warnings: [] },
      { number: 4, endNumber: 4, label: "", warnings: [] },
    ],
  );
  assert.equal(pages[1].items[0].text, "広い部屋だ");
});

test("単ページの endNumber は number と同じ", () => {
  const { pages } = parsePlot([{ text: "1.", indent: 0 }]);
  assert.equal(pages[0].endNumber, 1);
});

test("見開きに含まれるページ番号を再度使うと重複警告になる", () => {
  const { pages } = parsePlot([
    { text: "1.", indent: 0 },
    { text: "2-3.", indent: 0 },
    { text: "3.", indent: 0 },
  ]);
  assert.match(pages[2].warnings[0], /ページ番号 3 が重複/);
});

test("見開きの両ページが重複していると両方の番号を報告する", () => {
  const { pages } = parsePlot([
    { text: "1.", indent: 0 },
    { text: "2-3.", indent: 0 },
    { text: "2-3.", indent: 0 },
  ]);
  assert.deepEqual(pages[2].warnings, ["ページ番号 2, 3 が重複しています"]);
});

test("見開きの直前のページが欠落していると警告になる", () => {
  const { pages } = parsePlot([
    { text: "1.", indent: 0 },
    { text: "4-5.", indent: 0 },
  ]);
  assert.deepEqual(pages[1].warnings, ["ページ番号 2〜3 が欠落しています"]);
});

test("終了ページが開始ページ以下の見開きは警告して単ページとして扱う", () => {
  const { pages } = parsePlot([
    { text: "3-2.", indent: 0 },
    { text: "2-2.", indent: 0 },
  ]);
  assert.equal(pages[0].number, 3);
  assert.equal(pages[0].endNumber, 3);
  assert.match(pages[0].warnings[0], /見開きの範囲 3-2 が不正/);
  assert.equal(pages[1].endNumber, 2);
  assert.match(pages[1].warnings[0], /見開きの範囲 2-2 が不正/);
});

test("3ページ以上にまたがる範囲は受け付けつつ警告する", () => {
  const { pages } = parsePlot([
    { text: "1.", indent: 0 },
    { text: "2-4.", indent: 0 },
    { text: "5.", indent: 0 },
  ]);
  assert.equal(pages[1].endNumber, 4);
  assert.match(pages[1].warnings[0], /2-4 が 3 ページにまたがって/);
  assert.deepEqual(pages[2].warnings, []);
});

test("インデントされた `2-3.` はページ見出しにならない", () => {
  const { pages } = parsePlot([
    { text: "1.", indent: 0 },
    { text: "2-3.", indent: 1 },
  ]);
  assert.equal(pages.length, 1);
});

test("奇数ページから始まる見開きは警告しつつ見開きとして扱う", () => {
  const { pages } = parsePlot([
    { text: "1.", indent: 0 },
    { text: "2.", indent: 0 },
    { text: "3-4.", indent: 0 },
    { text: "5.", indent: 0 },
  ]);
  assert.equal(pages[2].number, 3);
  assert.equal(pages[2].endNumber, 4);
  assert.deepEqual(pages[2].warnings, ["見開き 3-4 が奇数ページから始まっています"]);
  assert.deepEqual(pages[3].warnings, []);
});

test("偶数ページから始まる見開きには奇数の警告が出ない", () => {
  const { pages } = parsePlot([
    { text: "1.", indent: 0 },
    { text: "2-3.", indent: 0 },
  ]);
  assert.deepEqual(pages[1].warnings, []);
});

/** @param {import("../src/types.js").PlotPage} page */
const kindsAndTexts = (page) => page.items.map(({ kind, text }) => ({ kind, text }));

test("1行に複数の括弧があれば順に別項目になる", () => {
  const { pages } = parsePlot([
    { text: "1.", indent: 0 },
    { text: "「でさー」「新譜マジやばいよね」「語彙がなくなるー」", indent: 1 },
  ]);
  assert.deepEqual(kindsAndTexts(pages[0]), [
    { kind: "dialogue", text: "でさー" },
    { kind: "dialogue", text: "新譜マジやばいよね" },
    { kind: "dialogue", text: "語彙がなくなるー" },
  ]);
  assert.deepEqual(pages[0].notes, [
    "1行を3項目に分割しました: 「でさー」「新譜マジやばいよね」「語彙がなくなるー」",
  ]);
  assert.deepEqual(pages[0].warnings, []);
});

test("分割した項目はすべて同じ sourceLine を持つ", () => {
  const { pages } = parsePlot([
    { text: "1.", indent: 0, sourceLine: 5 },
    { text: "「あ」「い」", indent: 1, sourceLine: 6 },
  ]);
  assert.deepEqual(pages[0].items.map((item) => item.sourceLine), [6, 6]);
});

test("最初の括弧より前の書き文字は出力せず情報として知らせる", () => {
  const { pages } = parsePlot([
    { text: "1.", indent: 0 },
    { text: "あ「はい」", indent: 1 },
    { text: "わー（キレーな人…）", indent: 1 },
  ]);
  assert.deepEqual(kindsAndTexts(pages[0]), [
    { kind: "dialogue", text: "はい" },
    { kind: "monologue", text: "キレーな人…" },
  ]);
  assert.deepEqual(pages[0].notes, [
    "括弧の前の「あ」を除外しました: あ「はい」",
    "括弧の前の「わー」を除外しました: わー（キレーな人…）",
  ]);
});

test("話者名の前置きも括弧の中だけを出力する", () => {
  const { pages } = parsePlot([
    { text: "1.", indent: 0 },
    { text: "主人公「はい」", indent: 1 },
    { text: "主人公 「はい」", indent: 1 },
  ]);
  assert.deepEqual(kindsAndTexts(pages[0]), [
    { kind: "dialogue", text: "はい" },
    { kind: "dialogue", text: "はい" },
  ]);
  assert.match(pages[0].notes[1], /^括弧の前の「主人公」を除外しました/);
});

test("括弧の内側の括弧は本文の一部として残る", () => {
  const { pages } = parsePlot([
    { text: "1.", indent: 0 },
    { text: "［「その場で出た言葉こそが本物だ」と言う人が苦手だった］", indent: 1 },
    { text: "「え（本気？）」", indent: 1 },
  ]);
  assert.deepEqual(kindsAndTexts(pages[0]), [
    { kind: "narration", text: "「その場で出た言葉こそが本物だ」と言う人が苦手だった" },
    { kind: "dialogue", text: "え（本気？）" },
  ]);
  assert.deepEqual(pages[0].notes, []);
});

test("種別の違う括弧が並んだ行も順に別項目になる", () => {
  const { pages } = parsePlot([
    { text: "1.", indent: 0 },
    { text: "［翌朝］「おはよう」", indent: 1 },
    { text: "「セリフ」 （モノローグ）", indent: 1 },
  ]);
  assert.deepEqual(kindsAndTexts(pages[0]), [
    { kind: "narration", text: "翌朝" },
    { kind: "dialogue", text: "おはよう" },
    { kind: "dialogue", text: "セリフ" },
    { kind: "monologue", text: "モノローグ" },
  ]);
});

test("括弧の後ろや間に地の文が続く行はト書きになる", () => {
  const { pages } = parsePlot([
    { text: "1.", indent: 0 },
    { text: "主人公が「はい」と言う", indent: 1 },
    { text: "「はい」と「いいえ」", indent: 1 },
  ]);
  assert.deepEqual(pages[0].items, []);
  assert.deepEqual(pages[0].notes, []);
});

test("括弧の対応が取れない行はト書きになる", () => {
  const { pages } = parsePlot([
    { text: "1.", indent: 0 },
    { text: "「閉じ忘れ", indent: 1 },
    { text: "「あ］", indent: 1 },
    { text: "」あ「", indent: 1 },
    { text: "あ）「はい」", indent: 1 },
  ]);
  assert.deepEqual(pages[0].items, []);
  assert.deepEqual(pages[0].notes, []);
});

test("書き文字の除外と分割の両方があれば情報を2件出す", () => {
  const { pages } = parsePlot([
    { text: "1.", indent: 0 },
    { text: "あ「はい」「いいえ」", indent: 1 },
  ]);
  assert.deepEqual(kindsAndTexts(pages[0]), [
    { kind: "dialogue", text: "はい" },
    { kind: "dialogue", text: "いいえ" },
  ]);
  assert.equal(pages[0].notes.length, 2);
});

test("見出し前の行は分割対象でも警告だけになる", () => {
  const { pages, warnings } = parsePlot([
    { text: "「あ」「い」", indent: 1 },
    { text: "1.", indent: 0 },
  ]);
  assert.equal(warnings.length, 1);
  assert.deepEqual(pages[0].notes, []);
});

test("見出し行の ID と区切り内の最大更新時刻を保持する", () => {
  const { pages } = parsePlot([
    { id: "h1", text: "1.", indent: 0, updated: 100 },
    { id: "l1", text: "「セリフ」", indent: 1, updated: 300 },
    { id: "c1", text: "[fsubal.icon] コメントの更新も含める", indent: 2, updated: 500 },
    { id: "e1", text: "", indent: 1, updated: 400 },
    { id: "h2", text: "2.", indent: 0, updated: 200 },
    { id: "t1", text: "ト書き", indent: 1, updated: 150 },
  ]);
  assert.equal(pages[0].headingId, "h1");
  assert.equal(pages[0].updated, 500);
  assert.equal(pages[1].headingId, "h2");
  assert.equal(pages[1].updated, 200);
});

test("ID や更新時刻が無い入力では headingId / updated を持たない", () => {
  const { pages } = parsePlot([{ text: "1.", indent: 0 }, { text: "「セリフ」", indent: 1 }]);
  assert.equal("headingId" in pages[0], false);
  assert.equal("updated" in pages[0], false);
});
