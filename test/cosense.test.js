import { test } from "node:test";
import assert from "node:assert/strict";
import { toPlotLines } from "../src/cosense.js";

test("タイトル行を除き、行頭の空白をインデントとして数える", () => {
  const lines = toPlotLines([
    { text: "ページタイトル" },
    { text: "1." },
    { text: " 「セリフ」" },
    { text: "\t\t[fsubal.icon] コメント" },
    { text: "　（全角スペースのインデント）" },
  ]);

  assert.deepEqual(lines, [
    { text: "1.", indent: 0, sourceLine: 1 },
    { text: "「セリフ」", indent: 1, sourceLine: 2 },
    { text: "[fsubal.icon] コメント", indent: 2, sourceLine: 3 },
    { text: "（全角スペースのインデント）", indent: 1, sourceLine: 4 },
  ]);
});

test("本文が空のページはそのまま空になる", () => {
  assert.deepEqual(toPlotLines([{ text: "ページタイトル" }]), []);
});
