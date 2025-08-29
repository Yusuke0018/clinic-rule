院内ルール 通知リレーAPI（MVP）

概要
- エンドポイント: `/notify`（GitHub Actions→HMAC署名POST）
- 設定画面: `/admin`（Basic認証）でChatworkトークン・ルームID・RELAY_SECRETを管理
- 保存先: `relay/secrets.json`（Git管理外）

起動
1) `cd relay && npm i`
2) 環境変数を設定: `BASIC_USER`, `BASIC_PASS`, `PORT`(任意), `ALLOWED_IPS`(任意, カンマ区切り)
3) `npm start`

GitHub設定
- Repo Variables: `RELAY_URL`（例: `https://relay.example.com`）
- Repo Secrets: `RELAY_SECRET`（/adminで生成して貼り付け）

テスト
- `/admin`で保存→「テスト送信」でChatworkにテスト投稿

注意
- TLSはリバースプロキシで終端（例: nginx/ALB）。ログにトークンは出力しません。

