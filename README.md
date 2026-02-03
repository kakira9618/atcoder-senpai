# AtCoder Senpai (Chrome Extension, MV3)

目的:
- AtCoder のコンテストページでログイン状態（ブラウザセッション）を使い、HTMLを取得して提出情報（コード/結果など）を収集し、ローカルに保存・JSONLでエクスポートします。

主な機能:
- /submissions/me を辿って自分の提出（提出詳細ページからコード/結果）を収集
- /standings から上位Nユーザー名を収集
- 上位Nユーザーについて /submissions?f.User=... を辿り、提出詳細ページからコード/結果を収集
- IndexedDB に保存し、JSONLでエクスポート（Downloadsに保存）
- JSON出力後に指定LLMで添削を実行し、Markdownとして保存（任意）

## インストール
1. Chrome で `chrome://extensions` を開く
2. 右上「デベロッパーモード」をON
3. 「パッケージ化されていない拡張機能を読み込む」→ このフォルダを選択

## 使い方
1. AtCoder の対象コンテストページ（例: https://atcoder.jp/contests/abc123 ）を開く
2. 拡張アイコン → Popup を開く
3. 収集したいボタンを押す
4. 「JSONLでエクスポート」でDownloadsに保存

### ユーザー指定
- オプションページで「私」として扱うユーザー名を設定できます（空欄ならログイン中のユーザー）。
- 指定した場合は `/submissions?f.User=<ユーザー名>` を辿って自分の提出を取得し、キャッシュもコンテスト×ユーザー名の組み合わせで保存します。

### エクスポート
- ダウンロードはZIP一括（`JSON/NDJSON`とAIレビューのMarkdownを同梱）。
- ZIP内にはフルデータと「コンテスト開催時間内のみ」のデータの2系統を出力します。AIレビューには後者を渡します。

### AI添削（オプション）
1. 拡張の「設定」から AI プロバイダ / モデル / APIキー を保存
2. Popup で「実行＆JSON出力 + AI添削(MD)」を押す
3. 収集完了後にAIが添削し、その結果MarkdownとJSONがまとめてDownloadsに保存されます（収集直後には保存しません）

## 注意
- 本拡張はAtCoderに負荷をかけないよう、リクエスト間にランダム遅延（ジッター）を入れています。
- 他者の提出コードの著作権は提出者に帰属します。共有・公開は避け、個人の学習・分析に限定してください。
- AtCoder の利用規約・AI利用ルールに従って運用してください。

## データ形式（JSONL）
各行が1提出（submission）です。主なフィールド:
- contest, submissionId, user, task, result, score, language, executionTime, memory, submittedAt, code
