セットアップ手順（管理者向け）

1. Pages: Settings → Pages → Build and deployment → Deploy from branch → Branch: main / Folder: /docs
2. ブランチ保護: Settings → Branches → Add rule → `main`、必要レビュー数（例:2）と「Require review from Code Owners」を有効化
3. 変数/シークレット: Settings → Secrets and variables → Actions → Repository variablesに`RELAY_URL`、Repository secretsに`RELAY_SECRET`
4. CODEOWNERS: `/rules/`ごとにレビュアと院長を割当（例: `/rules/02_受付.md @dept-reception-lead @Yusuke0018`）
5. リレーAPI: `relay/`をVPSに配置、TLS化、`/admin`でトークン・ルームID保存、テスト送信で確認
