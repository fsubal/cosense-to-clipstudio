/**
 * CLIP STUDIO への反映状態の追跡。
 * 「このページをコピー」した時点の各項目の本文を記録しておき、
 * 次に開いたときに現在の内容と突き合わせて「前回コピー後に変わったページ」を出す。
 * DOM・localStorage には依存しない純粋関数群
 */

/** @returns {import("./types.js").SyncRecord} */
export function emptyRecord() {
  return { version: 1, sections: {} };
}

/**
 * 保存されていた値が SyncRecord の形をしているか（壊れた JSON や古い形式を弾く）
 *
 * @param {unknown} value
 * @returns {value is import("./types.js").SyncRecord}
 */
export function isSyncRecord(value) {
  if (typeof value !== "object" || value === null) return false;
  const record = /** @type {Record<string, unknown>} */ (value);
  if (record.version !== 1) return false;
  if (typeof record.sections !== "object" || record.sections === null) return false;
  return Object.values(record.sections).every(isSyncSection);
}

/**
 * @param {unknown} value
 * @returns {value is import("./types.js").SyncSection}
 */
function isSyncSection(value) {
  if (typeof value !== "object" || value === null) return false;
  const section = /** @type {Record<string, unknown>} */ (value);
  return (
    Number.isInteger(section.number) &&
    Number.isInteger(section.endNumber) &&
    Array.isArray(section.texts) &&
    section.texts.every((text) => typeof text === "string") &&
    typeof section.copiedAt === "number"
  );
}

/**
 * 記録のキー。見出し行の ID があればページ番号を振り直しても同じ区切りとして追跡できる
 *
 * @param {import("./types.js").PlotPage} page
 * @returns {string}
 */
export function sectionKey(page) {
  return page.headingId ?? `n:${page.number}-${page.endNumber}`;
}

/**
 * ページをコピーしたことを記録した新しい SyncRecord を返す（入力は変更しない）。
 * 本文は全角化前の生のテキストを保存し、全角チェックボックスの切り替えで差分が出ないようにする
 *
 * @param {import("./types.js").SyncRecord} record
 * @param {import("./types.js").PlotPage} page
 * @param {number} now コピーした時刻（ミリ秒）
 * @returns {import("./types.js").SyncRecord}
 */
export function markCopied(record, page, now) {
  return {
    version: 1,
    sections: {
      ...record.sections,
      [sectionKey(page)]: {
        number: page.number,
        endNumber: page.endNumber,
        texts: page.items.map((item) => item.text),
        copiedAt: now,
      },
    },
  };
}

/**
 * 1ページ分の反映状態と項目ごとの差分
 *
 * @param {import("./types.js").SyncRecord} record
 * @param {import("./types.js").PlotPage} page
 * @returns {import("./types.js").PageSync}
 */
export function diffPage(record, page) {
  const previous = record.sections[sectionKey(page)];
  if (!previous) {
    return {
      status: "new",
      items: page.items.map(({ kind, text }) => ({ type: "same", kind, text })),
    };
  }

  const items = diffItems(previous.texts, page.items);
  const textChanged = items.some((item) => item.type !== "same");
  const renumbered =
    previous.number !== page.number || previous.endNumber !== page.endNumber;
  return {
    status: textChanged ? "changed" : renumbered ? "renumbered" : "synced",
    previous,
    items,
  };
}

/**
 * 記録時点の本文列と現在の項目列の差分（最長共通部分列）。
 * 共通する項目は順序を保ったまま `same`、記録側にだけあるものは `removed`、現在側にだけあるものは `added`
 *
 * @param {string[]} before
 * @param {import("./types.js").PlotItem[]} after
 * @returns {import("./types.js").DiffItem[]}
 */
export function diffItems(before, after) {
  const n = before.length;
  const m = after.length;
  // lcs[i][j] = before[i..] と after[j..] の最長共通部分列の長さ
  const lcs = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i][j] =
        before[i] === after[j].text
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  /** @type {import("./types.js").DiffItem[]} */
  const items = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j].text) {
      items.push({ type: "same", kind: after[j].kind, text: after[j].text });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      items.push({ type: "removed", text: before[i] });
      i += 1;
    } else {
      items.push({ type: "added", kind: after[j].kind, text: after[j].text });
      j += 1;
    }
  }
  for (; i < n; i += 1) items.push({ type: "removed", text: before[i] });
  for (; j < m; j += 1) items.push({ type: "added", kind: after[j].kind, text: after[j].text });
  return items;
}

/**
 * 作品全体の概要。記録にあるが現在の区切りに無いものは `removed`（CSP 側で消すべきページ）
 *
 * @param {import("./types.js").SyncRecord} record
 * @param {import("./types.js").PlotPage[]} pages
 * @returns {{
 *   changed: import("./types.js").PlotPage[],
 *   added: import("./types.js").PlotPage[],
 *   renumbered: import("./types.js").PlotPage[],
 *   synced: import("./types.js").PlotPage[],
 *   removed: { number: number, endNumber: number }[],
 * }}
 */
export function summarize(record, pages) {
  /** @type {ReturnType<typeof summarize>} */
  const summary = { changed: [], added: [], renumbered: [], synced: [], removed: [] };
  const seen = new Set();
  for (const page of pages) {
    seen.add(sectionKey(page));
    const { status } = diffPage(record, page);
    if (status === "changed") summary.changed.push(page);
    else if (status === "new") summary.added.push(page);
    else if (status === "renumbered") summary.renumbered.push(page);
    else summary.synced.push(page);
  }
  summary.removed = Object.entries(record.sections)
    .filter(([key]) => !seen.has(key))
    .map(([, section]) => ({ number: section.number, endNumber: section.endNumber }))
    .sort((a, b) => a.number - b.number);
  return summary;
}
