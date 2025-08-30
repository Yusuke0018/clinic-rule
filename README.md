院内ルール運用（MVP）

概要

- 申請→審議→承認→周知→公開をGitHubで完結します。
- 申請はIssueフォーム、承認はCODEOWNERS＋ブランチ保護、公開はPagesです。

使い方（スタッフ）

- 申請: ページの「ルール提案」からフォーム送信（GitHubアカウント不要）。または Issues→「院内ルールの提案（かんたん）」
- 閲覧: 提案は全員が閲覧できます（SPAの「提案一覧」またはIssues）。不要になった提案は「/withdraw」で削除可能。
- 反映: 院長がIssueに「/approve」コメント → 自動でPR作成 → マージで反映（Issueは自動クローズ）
- 公開: GitHub Pagesに自動反映（https://yusuke0018.github.io/clinic-rule/）

管理（院長/運用）

1. リレーAPI設置: `relay/`をVPSへ配置しTLS＋Basic認証
2. `/admin`でChatworkトークン・ルームID保存、RELAY_SECRET生成
3. リポに登録: Variables `RELAY_URL`、Secrets `RELAY_SECRET`
4. リポ設定: Pages = main /docs、ブランチ保護（必須レビュー/CODEOWNERS必須）

参考

- チートシート: docs/cheatsheet.md
- リレーAPI: relay/README.md

進捗（やったこと）

- 初期構成（rules/docs）とGitHub Pages公開用雛形を作成。
- Issueフォーム／PRテンプレ／CODEOWNERSを追加。
- ワークフロー: 「/approve」でIssueから直接コミット、マージ後の通知＋Pages同期、週次リマインダー、規約検証、ラベル初期化。
- リレーAPI（設定画面・HMAC署名検証・Chatwork投稿）を追加。
- 既定ルール（02〜07）を章立てで登録。
- セットアップ資料（docs/setup.md）とチートシート（docs/cheatsheet.md）を追加。

これからやること

- GitHub設定: Pagesをmain/docsで有効化、mainのブランチ保護（必須レビュー人数・CODEOWNERS必須）を有効化。
- リレーAPI: VPSへ配置しTLS＋Basic認証、/adminでトークン・ルームID保存とRELAY_SECRET生成→`RELAY_URL`/`RELAY_SECRET`をリポに登録。
- CODEOWNERSの詳細割当（各章のレビュー責任者の設定）。
- 週次リマインダーのメンション文言（`REMINDER_MENTION`）をVariablesに設定。
- E2E動作確認（申請→PR→承認→マージ→通知→Pages反映→Revert）。
- スタッフ向けチートシート配布と1〜2週間の試験運用→文言とCODEOWNERS微調整。

## いいね（likes）永続化の設定（Render）

目的: デプロイや再起動でいいね数が0に戻らないよう、GitHubリポジトリに `.data/likes.json` を保存します。他機能への影響はありません。

1. 環境変数（Render → Environment）

- `ENABLE_PERSIST_LIKES=true`

2. GitHub トークン（Fine‑grained token）

- Repository access: `clinic-rule`
- Permissions（必須）
  - Contents: Read and write（.data/likes.json をコミットするため）
  - Issues: Read and write（既存どおり）
- Render の Environment に `GITHUB_TOKEN` を保存（/admin ではなく Environment推奨）
- `GITHUB_REPO=Yusuke0018/clinic-rule` を設定

3. 確認

- `https://<relay>/healthz` が `ok`
- （任意）`https://<relay>/likes?issues=5` がJSONを返す
- ページをハードリロード（Shift+再読み込み）し、以前のいいね数が0に戻らないこと

4. 仕様

- 保存先: リポジトリ `main` の `.data/likes.json`
- 表示: まず `.data/likes.json`。無い場合は GitHub の +1 リアクション数で補完
- 書き込み競合は自動再試行（安全に上書きせずマージ）
- 失敗時は画面を壊さず既存値を維持

5. よくある原因

- `server_error`: トークンに Contents: Read and write が無い
- 0のまま: `ENABLE_PERSIST_LIKES` が未設定 or 再デプロイ未反映
- 初回: ファイル未作成は正常。最初のいいねで作成されます
