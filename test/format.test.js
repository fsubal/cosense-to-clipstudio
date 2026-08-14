import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePlot } from "../src/parse.js";
import { formatPage } from "../src/format.js";

test("1ページ目のコピー結果が完了条件と一致する", () => {
  const { pages } = parsePlot([
    { text: "1.", indent: 0 },
    { text: "「セリフはこう入れる」", indent: 1 },
    { text: "[fsubal.icon] 作者コメントはこう。出力しない", indent: 2 },
    { text: "［四角い吹き出しに入れるナレーションはこう］", indent: 1 },
    { text: "（丸ゴシックのモノローグはこう）", indent: 1 },
    { text: "2.", indent: 0 },
    { text: "[fsubal.icon] ここから2ページ目", indent: 1 },
  ]);

  assert.equal(
    formatPage(pages[0]),
    [
      "セリフはこう入れる",
      "",
      "四角い吹き出しに入れるナレーションはこう",
      "",
      "丸ゴシックのモノローグはこう",
    ].join("\n"),
  );
});

test("抽出項目0件のページは空文字になる", () => {
  const { pages } = parsePlot([{ text: "1.", indent: 0 }]);
  assert.equal(formatPage(pages[0]), "");
});
