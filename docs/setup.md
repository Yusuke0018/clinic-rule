セットアップ手順（管理者向け）

1. Pages: Settings → Pages → Build and deployment → Deploy from branch → Branch: main / Folder: /docs
2. ブランチ保護: Settings → Branches → Add rule → `main`、必要レビュー数（例:2）と「Require review from Code Owners」を有効化
3. 変数/シークレット: Settings → Secrets and variables → Actions → Repository variablesに`RELAY_URL`、Repository secretsに`RELAY_SECRET`
4. CODEOWNERS: `/rules/`ごとにレビュアと院長を割当（例: `/rules/02_受付.md @dept-reception-lead @Yusuke0018`）
5. リレーAPI: `relay/`をVPSに配置、TLS化。
   - 起動: Node 18+ で `PORT=8080 node server.js`
   - 管理: `https://<relay-host>/admin`（Basic認証: `BASIC_USER`/`BASIC_PASS`）。
   - 設定:
     - Chatworkトークン/ルームID（任意）
     - RELAY_SECRET（自動生成→GitHub側Secrets `RELAY_SECRET`にも同値を登録）
     - GitHub Token（repo権限でIssues作成可能なトークン）
     - GitHub Repo（例: `Yusuke0018/clinic-rule`）
   - Pages側: `docs/config.json` の `relay_url` に `https://<relay-host>` を設定（コミット必要）。
   - 確認:
     - `GET /healthz` が `ok` を返す
     - サイトの「ルール提案」フォームから送信→GitHub Issueが作成される
     - 「審議中のルール」で「いいね」カウントが増える（同端末1回）
