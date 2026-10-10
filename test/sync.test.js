import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePlot } from "../src/parse.js";
import {
  emptyRecord, isSyncRecord, sectionKey, markCopied, diffPage, diffItems, summarize,
} from "../src/sync.js";
import { createLocalSyncStore, syncStorageKey } from "../src/sync-store.js";

/**
 * 行 ID 付きの入力を作る
 * @param {string} id
 * @param {string} text
 * @param {number} [indent]
 * @param {number} [updated]
 * @returns {import("../src/types.js").PlotLine}
 */
const line = (id, text, indent = 1, updated) => ({ id, text, indent, ...(updated === undefined ? {} : { updated }) });

const plot = () => parsePlot([
  line("h1", "1.", 0, 100),
  line("l1", "「おはよう」", 1, 110),
  line("h2", "2-3. 見開き", 0, 120),
  line("l2", "「広いな」", 1, 130),
  line("l3", "（本当に）", 1, 125),
]);

test("記録が無いページは new で、項目はすべて same", () => {
  const { pages } = plot();
  const sync = diffPage(emptyRecord(), pages[0]);
  assert.equal(sync.status, "new");
  assert.equal(sync.previous, undefined);
  assert.deepEqual(sync.items, [{ type: "same", kind: "dialogue", text: "おはよう" }]);
});

test("コピーを記録すると synced になり、記録には生の本文と時刻が入る", () => {
  const { pages } = plot();
  const record = markCopied(emptyRecord(), pages[1], 1000);
  assert.deepEqual(record.sections, {
    h2: { number: 2, endNumber: 3, texts: ["広いな", "本当に"], copiedAt: 1000 },
  });
  const sync = diffPage(record, pages[1]);
  assert.equal(sync.status, "synced");
  assert.equal(sync.previous?.copiedAt, 1000);
});

test("markCopied は入力の記録を変更せず、他の区切りの記録を保つ", () => {
  const { pages } = plot();
  const first = markCopied(emptyRecord(), pages[0], 1);
  const before = structuredClone(first);
  const second = markCopied(first, pages[1], 2);
  assert.deepEqual(first, before);
  assert.deepEqual(Object.keys(second.sections), ["h1", "h2"]);
});

test("本文が変わると changed になり、項目ごとに追加・削除が分かる", () => {
  const { pages } = plot();
  const record = markCopied(emptyRecord(), pages[1], 1);
  const { pages: edited } = parsePlot([
    line("h2", "2-3. 見開き", 0),
    line("l2", "「広いな」", 1),
    line("l4", "「新しいセリフ」", 1),
  ]);
  const sync = diffPage(record, edited[0]);
  assert.equal(sync.status, "changed");
  assert.deepEqual(sync.items, [
    { type: "same", kind: "dialogue", text: "広いな" },
    { type: "removed", text: "本当に" },
    { type: "added", kind: "dialogue", text: "新しいセリフ" },
  ]);
});

test("本文が同じでページ番号だけ違えば renumbered", () => {
  const { pages } = plot();
  const record = markCopied(emptyRecord(), pages[0], 1);
  const { pages: shifted } = parsePlot([line("h1", "2.", 0), line("l1", "「おはよう」")]);
  const sync = diffPage(record, shifted[0]);
  assert.equal(sync.status, "renumbered");
  assert.deepEqual([sync.previous?.number, sync.previous?.endNumber], [1, 1]);
});

test("本文も番号も違えば changed（番号の違いは previous から分かる）", () => {
  const { pages } = plot();
  const record = markCopied(emptyRecord(), pages[0], 1);
  const { pages: edited } = parsePlot([line("h1", "2.", 0), line("l1", "「こんばんは」")]);
  const sync = diffPage(record, edited[0]);
  assert.equal(sync.status, "changed");
  assert.equal(sync.previous?.number, 1);
});

test("見出し ID が無ければページ番号でキーを作る", () => {
  const { pages } = parsePlot([{ text: "4-5.", indent: 0 }, { text: "6.", indent: 0 }]);
  assert.equal(sectionKey(pages[0]), "n:4-5");
  assert.equal(sectionKey(pages[1]), "n:6-6");
  const record = markCopied(emptyRecord(), pages[1], 1);
  assert.equal(diffPage(record, pages[1]).status, "synced");
});

test("差分は順序を保ち、入れ替えは削除と追加として出る", () => {
  /** @param {string[]} texts @returns {import("../src/types.js").PlotItem[]} */
  const after = (...texts) => texts.map((text) => ({ kind: "dialogue", text, sourceLine: 0 }));
  assert.deepEqual(diffItems([], after("a")).map((i) => i.type), ["added"]);
  assert.deepEqual(diffItems(["a"], []).map((i) => i.type), ["removed"]);
  assert.deepEqual(
    diffItems(["a", "b", "c"], after("c", "a", "b")).map((i) => `${i.type}:${i.text}`),
    ["added:c", "same:a", "same:b", "removed:c"],
  );
  assert.deepEqual(
    diffItems(["a", "b"], after("a", "x", "b")).map((i) => `${i.type}:${i.text}`),
    ["same:a", "added:x", "same:b"],
  );
});

test("全角化の切り替えは差分に影響しない（記録は生の本文）", () => {
  const { pages } = parsePlot([line("h1", "1.", 0), line("l1", "「Lv99」")]);
  const record = markCopied(emptyRecord(), pages[0], 1);
  assert.deepEqual(record.sections.h1.texts, ["Lv99"]);
  assert.equal(diffPage(record, pages[0]).status, "synced");
});

test("概要は変更・未コピー・番号変更・反映済み・削除を分ける", () => {
  const { pages } = plot();
  let record = markCopied(emptyRecord(), pages[0], 1);
  record = markCopied(record, pages[1], 2);
  record = markCopied(record, { number: 9, endNumber: 9, headingId: "gone", label: "", items: [], warnings: [], notes: [] }, 3);

  const { pages: now } = parsePlot([
    line("h1", "1.", 0), line("l1", "「おはよう」"),
    line("h2", "2-3. 見開き", 0), line("l2", "「直した」"),
    line("h3", "4.", 0),
  ]);
  const summary = summarize(record, now);
  assert.deepEqual(summary.synced.map((p) => p.number), [1]);
  assert.deepEqual(summary.changed.map((p) => p.number), [2]);
  assert.deepEqual(summary.added.map((p) => p.number), [4]);
  assert.deepEqual(summary.renumbered, []);
  assert.deepEqual(summary.removed, [{ number: 9, endNumber: 9 }]);
});

test("isSyncRecord は壊れた値を弾く", () => {
  assert.equal(isSyncRecord(emptyRecord()), true);
  assert.equal(isSyncRecord(markCopied(emptyRecord(), plot().pages[0], 1)), true);
  assert.equal(isSyncRecord(null), false);
  assert.equal(isSyncRecord("x"), false);
  assert.equal(isSyncRecord({ version: 2, sections: {} }), false);
  assert.equal(isSyncRecord({ version: 1 }), false);
  assert.equal(isSyncRecord({ version: 1, sections: { a: { number: 1 } } }), false);
  assert.equal(isSyncRecord({ version: 1, sections: { a: { number: 1, endNumber: 1, texts: [1], copiedAt: 0 } } }), false);
});

test("localStorage ストアは読み書きでき、壊れた値や例外でも空の記録を返す", () => {
  /** @type {Map<string, string>} */
  const map = new Map();
  const storage = {
    getItem: (/** @type {string} */ k) => map.get(k) ?? null,
    setItem: (/** @type {string} */ k, /** @type {string} */ v) => { map.set(k, v); },
  };
  const key = syncStorageKey("proj", "page1");
  assert.equal(key, "cosense-to-clipstudio:sync:proj/page1");
  const store = createLocalSyncStore(key, storage);

  assert.deepEqual(store.load(), emptyRecord());
  const record = markCopied(emptyRecord(), plot().pages[0], 5);
  assert.equal(store.save(record), true);
  assert.deepEqual(store.load(), record);

  map.set(key, "{broken");
  assert.deepEqual(store.load(), emptyRecord());
  map.set(key, JSON.stringify({ version: 99 }));
  assert.deepEqual(store.load(), emptyRecord());

  const throwing = createLocalSyncStore(key, {
    getItem: () => { throw new Error("denied"); },
    setItem: () => { throw new Error("quota"); },
  });
  assert.deepEqual(throwing.load(), emptyRecord());
  assert.equal(throwing.save(record), false);
  assert.equal(createLocalSyncStore(key, undefined).save(record), false);
  assert.deepEqual(createLocalSyncStore(key, undefined).load(), emptyRecord());
});
