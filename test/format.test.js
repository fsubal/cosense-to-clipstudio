import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePlot } from "../src/parse.js";
import { formatPage, toFullWidthAlnum, createManifest } from "../src/format.js";

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

test("半角英数字だけが全角になり、記号・空白・全角文字はそのまま", () => {
  assert.equal(toFullWidthAlnum("Lv99のMP回復"), "Ｌｖ９９のＭＰ回復");
  assert.equal(toFullWidthAlnum("abc XYZ 019"), "ａｂｃ ＸＹＺ ０１９");
  assert.equal(toFullWidthAlnum("え!? OK…"), "え!? ＯＫ…");
  assert.equal(toFullWidthAlnum("ＡＢＣ１２３"), "ＡＢＣ１２３");
  assert.equal(toFullWidthAlnum(""), "");
});

test("fullWidth オプションでコピー結果の英数字が全角になる", () => {
  const { pages } = parsePlot([
    { text: "1.", indent: 0 },
    { text: "「3時にA棟で」", indent: 1 },
    { text: "（PCが…）", indent: 1 },
  ]);
  assert.equal(formatPage(pages[0], { fullWidth: true }), "３時にＡ棟で\n\nＰＣが…");
  assert.equal(formatPage(pages[0]), "3時にA棟で\n\nPCが…");
  assert.equal(formatPage(pages[0], { fullWidth: false }), "3時にA棟で\n\nPCが…");
});

test("fullWidth オプションは manifest の本文にも効き、フラグが記録される", () => {
  const result = parsePlot([
    { text: "1.", indent: 0 },
    { text: "「Lv99」", indent: 1 },
  ]);
  const converted = createManifest(result, { fullWidth: true });
  assert.equal(converted.pages[0].items[0].text, "Ｌｖ９９");
  assert.equal(converted.fullWidth, true);
  const raw = createManifest(result);
  assert.equal(raw.pages[0].items[0].text, "Lv99");
  assert.equal("fullWidth" in raw, false);
  // 変換は出力側だけで、パース結果は変わらない
  assert.equal(result.pages[0].items[0].text, "Lv99");
});
