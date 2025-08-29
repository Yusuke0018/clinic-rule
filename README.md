院内ルール運用（MVP）

概要

- 申請→審議→承認→周知→公開をGitHubで完結します。
- 申請はIssueフォーム、承認はCODEOWNERS＋ブランチ保護、公開はPagesです。

使い方（スタッフ）

- 申請: Issues→「院内ルール改定の提案」から送信
- 進行: 自動PRの差分を確認→レビュア/院長が承認→マージ
- 公開: GitHub Pagesに自動反映（docs配下）

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
- ワークフロー: Issue→PR自動化、マージ後の通知＋Pages同期、週次リマインダー、規約検証、ラベル初期化。
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
