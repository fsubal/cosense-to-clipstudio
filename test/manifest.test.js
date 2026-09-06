import { test } from "node:test";
import assert from "node:assert/strict";
import { createManifest, formatManifest, formatPage } from "../src/format.js";
import { parsePlot } from "../src/parse.js";
import { toPlotLines } from "../src/cosense.js";

test("Cosenseから全種別・ラベル・元行番号・空ページをJSONへ保持する", () => {
  const result = parsePlot(toPlotLines([
    { text: "第1話" }, { text: "1. 通勤" },
    { text: ' 「こんにちは」' }, { text: " ［翌朝］" },
    { text: " （眠い）" }, { text: "2." },
  ]));
  const source = { title: "第1話", url: "https://scrapbox.io/example/第1話" };
  const json = formatManifest(result, { source });
  assert.deepEqual(JSON.parse(json), {
    schema: "cosense-to-clipstudio/manifest", version: 1, source, pageCount: 2,
    pages: [
      { number: 1, label: "通勤", items: [
        { kind: "dialogue", text: "こんにちは", sourceLine: 2 },
        { kind: "narration", text: "翌朝", sourceLine: 3 },
        { kind: "monologue", text: "眠い", sourceLine: 4 },
      ], warnings: [] },
      { number: 2, label: "", items: [], warnings: [] },
    ], warnings: [],
  });
  assert.equal(formatPage(result.pages[0]), "こんにちは\n\n翌朝\n\n眠い");
});

test("欠番・重複・逆順・グローバル警告を補正せず保持する", () => {
  const result = parsePlot(toPlotLines([
    { text: "作品" }, { text: "「見出し前」" },
    { text: "1." }, { text: "4." }, { text: "4." }, { text: "2." },
  ]));
  const manifest = createManifest(result);
  assert.deepEqual(manifest.pages, result.pages);
  assert.deepEqual(manifest.warnings, result.warnings);
  assert.ok(result.warnings.length + result.pages.flatMap(p => p.warnings).length > 0);
  assert.equal(manifest.pageCount, 4);
  assert.deepEqual(manifest.pages.map(p => p.number), [1, 4, 4, 2]);
});

test("空の結果・source未取得・任意設定なしでも有効なJSON", () => {
  assert.deepEqual(JSON.parse(formatManifest({ pages: [], warnings: ["警告"] })), {
    schema: "cosense-to-clipstudio/manifest", version: 1, source: {},
    pageCount: 0, pages: [], warnings: ["警告"],
  });
});

test("設定のページ数は抽出数と独立し、入力との参照共有がない", () => {
  const result = parsePlot([{ text: "7. ラベル", indent: 0 }, { text: "「本文」", indent: 1 }]);
  const options = { source: { title: "作品" }, documentSettings: { title: "第7話", pageCount: 18, presetName: "商業原稿" } };
  const before = structuredClone({ result, options });
  const manifest = createManifest(result, options);
  assert.equal(manifest.pageCount, 1);
  assert.deepEqual(manifest.documentSettings, options.documentSettings);
  manifest.pages[0].items[0].text = "変更";
  manifest.pages[0].warnings.push("追加");
  manifest.warnings.push("追加");
  manifest.source.title = "変更";
  if (manifest.documentSettings) manifest.documentSettings.title = "変更";
  assert.deepEqual({ result, options }, before);
});

test("改行・引用符・バックスラッシュをJSONで往復できる", () => {
  const result = { pages: [{ number: 1, label: "", items: [
    { kind: /** @type {const} */ ("dialogue"), text: '日本語\n"引用"\\末尾', sourceLine: 0 },
  ], warnings: [] }], warnings: [] };
  assert.deepEqual(JSON.parse(formatManifest(result)).pages, result.pages);
});
