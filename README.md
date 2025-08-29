院内ルール運用（MVP）

概要
- 申請→審議→承認→周知→公開をGitHubで完結します。
- 申請はIssueフォーム、承認はCODEOWNERS＋ブランチ保護、公開はPagesです。

使い方（スタッフ）
- 申請: Issues→「院内ルール改定の提案」から送信
- 進行: 自動PRの差分を確認→レビュア/院長が承認→マージ
- 公開: GitHub Pagesに自動反映（docs配下）

管理（院長/運用）
1) リレーAPI設置: `relay/`をVPSへ配置しTLS＋Basic認証
2) `/admin`でChatworkトークン・ルームID保存、RELAY_SECRET生成
3) リポに登録: Variables `RELAY_URL`、Secrets `RELAY_SECRET`
4) リポ設定: Pages = main /docs、ブランチ保護（必須レビュー/CODEOWNERS必須）

参考
- チートシート: docs/cheatsheet.md
- リレーAPI: relay/README.md

