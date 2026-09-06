# cosense-to-clipstudio

Cosense (Scrapbox) で書いた漫画プロットを、CLIP STUDIO PAINT EX の
ストーリーエディターへ貼り付けやすい形式に変換する Cosense UserScript。

Mac の Chrome / Vivaldi 上の Cosense でテキストをコピーし、
Universal Clipboard 経由で iPad の CLIP STUDIO PAINT に貼り付ける用途を想定しています。

## プロットの書き方

Cosense 上で次のような構造でプロットを書きます。

```
1.
 「セリフはこう入れる」
  [fsubal.icon] 作者コメントはこう。出力しない
 ［四角い吹き出しに入れるナレーションはこう］
 （丸ゴシックのモノローグはこう）
2.
 [fsubal.icon] ここから2ページ目
```

### 変換規則

| 記法 | 種別 | 出力 |
| --- | --- | --- |
| インデント0の `1.` `2. 通勤のシーン` など | ページ区切り | （見出し自体は出力しない） |
| `「……」` で行全体が囲まれた行 | セリフ | 括弧を外して出力 |
| `［……］`（全角角括弧）で行全体が囲まれた行 | ナレーション | 括弧を外して出力 |
| `（……）`（全角丸括弧）で行全体が囲まれた行 | モノローグ | 括弧を外して出力 |
| `[〇〇.icon]` から始まる行 | 作者コメント | 出力しない |
| `[- ……]` で囲まれた領域（取り消し線） | 削除済みテキスト | 出力しない（行の一部ならその部分だけ除去） |
| それ以外の行 | ト書き | 出力しない |

- テキスト項目の間には空行を1行挟みます（ストーリーエディターが空行区切りで項目を分けるため）
- ページ番号の重複・欠落・昇順でない番号・ページ見出しより前のテキストは警告としてモーダルに表示します
- 括弧は**全角**の `［］` `（）` だけを認識します。半角 `[]` は Cosense のリンク記法と衝突するため対象外です

## インストール

1. Cosense の右上メニュー → `Edit Profile` → `UserScript` を Enabled にする
2. 自分のプロフィールページ（`/プロジェクト名/自分のユーザー名`）に以下のコードブロックを作る

   ```
   code:script.js
   ```

3. [`dist/script.js`](./dist/script.js) の中身をそのコードブロックの中へ貼り付ける
4. ブラウザをリロードする

UserScript は自分にだけ有効です。プロジェクトの他のメンバーには影響しません。

## 使い方

1. プロットを書いた Cosense ページを開く
2. ページ右上の Page Menu に追加された「CLIPSTUDIO用に出力」（CSP アイコン）をクリック
3. モーダルにページごとの抽出結果（種別バッジ・警告つき）が表示される
   - モノローグは丸ゴシック風フォント + 紫色でプレビューされます
   - 前ページ／次ページボタンでページを移動できます
4. 「このページをコピー」でそのページのテキストがクリップボードに入る
5. iPad 側の CLIP STUDIO PAINT EX でストーリーエディターを開き、貼り付ける
   - 初期版ではフォント情報はクリップボードに含めません（プレーンテキストのみ）

## 開発

```sh
npm install
npm test        # パーサー・フォーマッターの単体テスト (node:test)
npm run build   # src/ を dist/script.js にバンドル (esbuild)
```

- TypeScript は使わず、jsconfig.json + JSDoc で型を付けています
  （`npx tsc -p jsconfig.json` で型チェックできます）
- パーサーのコア (`src/parse.js`) は DOM や `window.cosense` に依存せず、
  `{ text, indent }` の配列を入力に取るので単体テストできます

### 構成

| ファイル | 役割 |
| --- | --- |
| `src/parse.js` | プロット解析（純粋関数） |
| `src/format.js` | CSP 向けテキスト生成 |
| `src/cosense.js` | Cosense 依存部分（`cosense.Page.lines` → パーサー入力への変換） |
| `src/ui.js` | モーダル UI |
| `src/index.js` | エントリーポイント（Page Menu への登録） |

### 設計メモ

- `cosense.Page.lines` の各行は `{ text, id, ... }` で、インデントは
  `text` 先頭の空白文字（半角スペース・タブ・全角スペース）として表現されます。
  1行目はページタイトルなので除外しています
  （[scrapbox-jp/types](https://github.com/scrapbox-jp/types) の型定義で確認）
- `window.cosense` と `window.scrapbox` は同じオブジェクトです
  （[help-jp リリースノート2024](https://scrapbox.io/help-jp/リリースノート2024)
  「window.cosenseとwindow.scrapboxのどちらでもUserScriptが使えるようにする」）
- `scrapbox.PageMenu.addMenu({ title, image, onClick })` でボタンを追加します
  （[scrapboxlab/Page Menuにボタンを追加する](https://scrapbox.io/scrapboxlab/Page_Menuにボタンを追加する)）
- [@progfay/scrapbox-parser](https://github.com/progfay/scrapbox-parser) は
  使っていません。行全体の括弧種別とインデントしか見ないため、
  構文木パーサーは不要と判断しました

## 実機確認手順

1. [インストール](#インストール) の手順で `dist/script.js` を自分のページに貼り付け、リロードする
2. Cosense に新しいページを作り、[プロットの書き方](#プロットの書き方) の入力例をそのまま書く
3. Page Menu に「CLIPSTUDIO用に出力」ボタンが表示されることを確認する
4. クリックしてモーダルが開き、以下になることを確認する
   - 1ページ目: セリフ／ナレーション／モノローグの3項目
   - 2ページ目: 抽出項目0件
5. 1ページ目で「このページをコピー」を押し、貼り付けた結果が以下になることを確認する

   ```
   セリフはこう入れる

   四角い吹き出しに入れるナレーションはこう

   丸ゴシックのモノローグはこう
   ```

6. iPad の CLIP STUDIO PAINT EX でストーリーエディターを開き、
   Universal Clipboard 経由で貼り付けて1項目ずつに分かれることを確認する

## 未確認事項（実機で要検証）

以下は実機の Cosense / CLIP STUDIO で未確認です。単体テストが通ることと
公開されている型定義・ドキュメントに基づく実装であり、動作を保証しません。

- Page Menu ボタンの実際の表示（`image` に data URI の SVG を渡しているが、
  実例で確認できたのは Gyazo 等の画像 URL のみ）
- 実際の `cosense.Page.lines` のデータ（型定義からの推定。特に行頭空白の扱い）
- `navigator.clipboard.writeText` が Cosense 上で許可されるか
  （失敗時は `document.execCommand("copy")` にフォールバックする実装あり）
- CLIP STUDIO PAINT EX ストーリーエディターが空行区切りテキストを
  複数項目として取り込む挙動

## Computer Use連携（Mac版CSPは未検証）

Cosenseの現在のプロットページを1作品として、全ページの中間表現（manifest）をJSONで出力します。
Mac版CSPの起動・作品作成・テキスト投入を行う機能ではありません。

1. 再ビルド済みの `dist/script.js` をプロフィールのUserScriptに貼り替え、リロードします。
2. プロットページの「CLIPSTUDIO用に出力」を開きます。
3. 「Computer Use用JSONをコピー」で作品全体のJSONをコピーします。
   ファイルが必要なら「Computer Use用JSONを書き出す」で
   `cosense-to-clipstudio.manifest.json` を保存します。
4. Astra / Computer Useの会話にJSONを貼り付けるかファイルを添付し、
   「このmanifestのページ構成と警告を確認して」のように指示します。

従来の「このページをコピー」は引き続き空行区切りの本文だけをコピーします。
JSONボタンは表示中のページにかかわらず全ページを出力し、抽出ページが0件でも利用できます。
コピー失敗時には書き出しボタンを利用してください。開いた時点のスナップショットなので、
プロットを編集した場合はモーダルを開き直してください。

### manifest例

```json
{
  "schema": "cosense-to-clipstudio/manifest",
  "version": 1,
  "source": {
    "title": "第7話",
    "url": "https://scrapbox.io/example/第7話"
  },
  "pageCount": 2,
  "pages": [
    {
      "number": 1,
      "label": "通勤のシーン",
      "items": [
        { "kind": "dialogue", "text": "おはよう", "sourceLine": 2 },
        { "kind": "narration", "text": "翌朝", "sourceLine": 3 },
        { "kind": "monologue", "text": "眠い", "sourceLine": 4 }
      ],
      "warnings": []
    },
    { "number": 2, "label": "", "items": [], "warnings": [] }
  ],
  "warnings": []
}
```

- `schema` は形式の識別子、`version` は整数の形式バージョン（現在は1）です。
- `source.title` はCosenseのタイトル行、`source.url` は実行時のページURLです。
  取得できないフィールドは省略し、情報がない場合も `source: {}` を出力します。
- `pageCount` は抽出したページの個数です。最大ページ番号ではありません。
  ページ番号の重複・欠落・逆順や空ページは補正せず、入力順に保持します。
- `sourceLine` は元のCosenseページの行番号で、タイトル行を0とします。
- 各ページの `warnings` とトップレベルの `warnings`（ページに属さない警告）は
  パーサーの結果をそのまま保持します。自動操作前に両方を確認してください。
- `kind` は `dialogue` / `narration` / `monologue` を保持します。
  フォントなどCSP固有の設定への割り当ては、将来の利用側で決めます。

### 任意の作品設定（開発者向け）

`src/format.js` の純粋関数 `createManifest(result, options)` はオブジェクトを、
`formatManifest(result, options)` は整形済みJSON文字列を返します。
`openModal(result, options)` にも同じオプションを渡せます。

```js
const json = formatManifest(result, {
  source: { title: "第7話", url: "https://scrapbox.io/example/第7話" },
  documentSettings: {
    title: "episode-007",
    pageCount: 18,
    presetName: "商業原稿"
  }
});
```

指定した場合のみトップレベルに `documentSettings` が追加されます。
`title`（作品名）、`pageCount`（作成したいページ数）、`presetName` は任意です。
抽出数の `pageCount` とは独立し、設定の補完・検証・CSPへの適用は行いません。
現時点のUIには設定入力欄を設けていません。将来、用紙サイズや解像度などの
オプションをこの設定オブジェクトへ追加できる設計です。

### 確認範囲

単体テストは種別・元行番号・警告・空ページ・番号の保持、JSONの往復、
任意設定と既存のページ単位テキスト出力を確認します。
実際のCosense上での新ボタンの操作・ダウンロード・Universal Clipboard、
およびMac版CSPへの投入は未検証です。
