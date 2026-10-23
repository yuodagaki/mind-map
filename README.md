# マインドマップ

ブラウザだけで動くシンプルなマインドマップ作成アプリです。バックエンドやデータベースを持たず、作成したマインドマップは yml ファイルとしてローカルに保存・読込します。

公開URL: https://yuodagaki.github.io/mind-map/

## 特徴

* フロントエンドのみで完結(ビルドステップなし、npm install 不要)
* ノードの自由配置・ドラッグ&ドロップ操作に対応
* 保存データは yml 形式。File System Access API 対応ブラウザでは同一ファイルへの上書き保存・再読込が可能
* ブラウザの永続ストレージ(localStorage / IndexedDB / Cookie 等)は一切使用しない。**保存せずにリロードすると編集内容は失われます**
* アプリ内の「?」ボタンから使い方(ヘルプ)をいつでも確認できる

## 構成

* JavaScript (ES Modules, Vanilla JS) + HTML
* TailwindCSS (Play CDN版、ビルドステップなし)
* yml ⇔ JS オブジェクトの変換に [js-yaml](https://github.com/nodeca/js-yaml) (CDN配布版) を利用

```
index.html
js/
  main.js      エントリーポイント、イベント初期化
  mindmap.js   状態管理・ツリー操作ロジック
  render.js    DOM/SVG描画
  file-io.js   yml読み書き(File System Access API / ダウンロード・アップロード)
```

## ローカルでの動かし方

ビルド不要なので、`index.html` をブラウザで直接開くだけで動作します。File System Access API を使う機能(同一ファイルへの上書き保存等)を試す場合は、`file://` ではなく簡易サーバー経由での起動を推奨します。

```sh
cd mind-map
python3 -m http.server 8000
# ブラウザで http://localhost:8000 を開く
```

## データ形式

ノードはツリー構造(単一ルート)で保持します。保存ファイルは yml 形式です。

```yaml
root:
  id: "node-1"
  text: "中心テーマ"
  color: "#fbbf24"
  textColor: "#1e293b"
  position: { x: 0, y: 0 }
  collapsed: false
  children:
    - id: "node-2"
      text: "サブテーマ1"
      color: "#60a5fa"
      textColor: "#1e293b"
      position: { x: 200, y: -100 }
      collapsed: false
      children: []
```

| フィールド | 内容 |
| --- | --- |
| `id` | ノード一意識別子 |
| `text` | ノードのテキスト |
| `color` | ノードの背景色 |
| `textColor` | ノードの文字色 |
| `position` | `{ x, y }` 座標(自由配置のため保存される) |
| `collapsed` | 子ノードを折りたたんで非表示にしているか |
| `children` | 子ノードの配列 |

`textColor` / `collapsed` を含まない旧形式の yml を読み込んだ場合は、デフォルト値(文字色・展開状態)を補完して読み込みます(後方互換)。

## 保存・読込

* File System Access API 対応ブラウザ(Chrome / Edge 等): `showSaveFilePicker` / `showOpenFilePicker` により同一ファイルへの上書き保存・再読込が可能
* 非対応ブラウザ(Safari / Firefox 等): 保存時は Blob を生成してダウンロード、読込時は `<input type="file">` でアップロード

## 操作一覧

アプリ内のヘルプ(「?」ボタン)でも同じ内容を確認できます。

| 操作 | 方法 |
| --- | --- |
| ノード新規作成 | ノードを選択して **Enter**、またはノードの「＋」ボタン |
| ノード編集 | **F2**、ノードの「✎」ボタン、またはツールバーの「編集」ボタン(確定: Enter またはフォーカスを外す / キャンセル: Escape) |
| ノード複製 | **Ctrl+D**(Mac: Cmd+D)、またはツールバーの「複製」ボタン(ルートノードは複製不可) |
| ノード削除 | **Delete**、ノードの「×」ボタン、またはツールバーの「削除」ボタン(子ノードも再帰的に削除。ルートノードは削除不可) |
| ノード移動・付け替え | ドラッグ&ドロップ(別ノード上にドロップすると子として付け替え。親を移動すると子孫も一緒に移動) |
| 色変更 | ツールバーの「背景色」「文字色」のカラーピッカー、またはパレットから選択 |
| 折りたたみ・展開 | 子を持つノードの「▾/▸」ボタン(折りたたみ中は子の数を表示) |
| 検索 | ツールバーの検索ボックスに入力。**Enter** で次の一致、**Shift+Enter** で前の一致へ(折りたたまれた枝の中の一致は祖先を自動展開) |
| 元に戻す / やり直し | **Ctrl+Z** / **Ctrl+Shift+Z**(または Ctrl+Y) |
| 保存 | ツールバーの「保存」ボタン、または **Ctrl+S** |
| 読込 | ツールバーの「読込」ボタン |

## 既知の制約

* バックエンドを持たず、データは一切サーバーに送信・保存されません
* ブラウザの永続ストレージを使わないため、保存せずにページをリロード・閉じると編集内容は失われます
