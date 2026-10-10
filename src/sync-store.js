/**
 * SyncRecord の localStorage への保存。
 * 記録はこのブラウザにだけ残り、別のブラウザや端末には引き継がれない
 */

import { emptyRecord, isSyncRecord } from "./sync.js";

const STORAGE_PREFIX = "cosense-to-clipstudio:sync:";

/**
 * @param {string} projectName
 * @param {string} pageId
 * @returns {string}
 */
export function syncStorageKey(projectName, pageId) {
  return `${STORAGE_PREFIX}${projectName}/${pageId}`;
}

/**
 * @typedef {Pick<Storage, "getItem" | "setItem">} StorageLike
 */

/**
 * localStorage を使った SyncStore。
 * 読み書きに失敗しても例外を投げず、読めなければ空の記録を返す
 *
 * @param {string} key
 * @param {StorageLike | undefined} [storage] 省略時は globalThis.localStorage
 * @returns {import("./types.js").SyncStore}
 */
export function createLocalSyncStore(key, storage = defaultStorage()) {
  return {
    load() {
      try {
        const raw = storage?.getItem(key);
        if (raw === null || raw === undefined) return emptyRecord();
        const parsed = JSON.parse(raw);
        return isSyncRecord(parsed) ? parsed : emptyRecord();
      } catch {
        return emptyRecord();
      }
    },
    save(record) {
      try {
        if (!storage) return false;
        storage.setItem(key, JSON.stringify(record));
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** @returns {StorageLike | undefined} */
function defaultStorage() {
  try {
    return /** @type {any} */ (globalThis).localStorage;
  } catch {
    // プライベートモードなどで localStorage へのアクセス自体が例外になる環境
    return undefined;
  }
}
