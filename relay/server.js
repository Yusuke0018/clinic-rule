/* eslint-disable no-console */
const express = require('express');
const basicAuth = require('express-basic-auth');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const app = express();
app.set('trust proxy', process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : 1);
app.use(helmet());

// keep raw body for HMAC verification
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

const limiter = rateLimit({ windowMs: 60 * 1000, max: 60 });
app.use(limiter);

const dataDir = __dirname;
const secretPath = path.join(dataDir, 'secrets.json');

function readSecrets() {
  try {
    const s = JSON.parse(fs.readFileSync(secretPath, 'utf8'));
    return s || {};
  } catch (_e) {
    return {};
  }
}

function writeSecrets(obj) {
  const json = JSON.stringify(obj, null, 2);
  fs.writeFileSync(secretPath, json, { encoding: 'utf8', mode: 0o600 });
  try { fs.chmodSync(secretPath, 0o600); } catch (_e) {}
}

function genSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function ipAllowed(req) {
  const allow = (process.env.ALLOWED_IPS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (allow.length === 0) return true;
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
  return allow.includes(ip);
}

// Basic auth for admin
const adminAuth = basicAuth({
  users: { [process.env.BASIC_USER || 'admin']: process.env.BASIC_PASS || 'change-me' },
  challenge: true,
});

app.get('/healthz', (_req, res) => res.status(200).send('ok'));

app.get('/admin', adminAuth, (req, res) => {
  if (!ipAllowed(req)) return res.status(403).send('forbidden');
  const { chatwork_token = '', room_id = '', relay_secret = '' } = readSecrets();
  const mask = (v) => v ? v.slice(0, 3) + '***' + v.slice(-3) : '';
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>院内ルール リレー設定</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:sans-serif;max-width:720px;margin:24px auto;padding:0 12px}label{display:block;margin:.5rem 0 .25rem}input[type=text],input[type=password]{width:100%;padding:.5rem}button{padding:.5rem 1rem;margin-right:.5rem}</style></head><body>
  <h1>院内ルール リレー設定</h1>
  <form method="post" action="/admin/save">
    <label>Chatworkトークン</label>
    <input type="password" name="chatwork_token" placeholder="xxxxxxxx" value="" />
    <small>保存済み: ${mask(chatwork_token) || '未設定'}</small>
    <label>チャットルームID</label>
    <input type="text" name="room_id" value="${room_id || ''}" />
    <label>RELAY_SECRET（GitHub Secretsに貼り付け）</label>
    <input type="text" name="relay_secret" value="${relay_secret || ''}" />
    <div style="margin-top:8px">
      <button type="submit">保存</button>
      <button formaction="/admin/gen-secret" formmethod="post">RELAY_SECRET自動生成</button>
      <button formaction="/admin/test" formmethod="post">テスト送信</button>
    </div>
  </form>
  <p>注意: トークンはサーバーのsecrets.jsonにのみ保存され、ログ出力しません。</p>
  </body></html>`);
});

app.post('/admin/gen-secret', adminAuth, (req, res) => {
  if (!ipAllowed(req)) return res.status(403).send('forbidden');
  const s = readSecrets();
  s.relay_secret = genSecret(32);
  writeSecrets(s);
  res.redirect('/admin');
});

// urlencoded for admin posts
app.use(express.urlencoded({ extended: false }));

app.post('/admin/save', adminAuth, (req, res) => {
  if (!ipAllowed(req)) return res.status(403).send('forbidden');
  const s = readSecrets();
  if (req.body.chatwork_token) s.chatwork_token = req.body.chatwork_token;
  if (req.body.room_id !== undefined) s.room_id = String(req.body.room_id || '');
  if (req.body.relay_secret) s.relay_secret = req.body.relay_secret;
  if (!s.relay_secret) s.relay_secret = genSecret(32);
  writeSecrets(s);
  res.redirect('/admin');
});

app.post('/admin/test', adminAuth, async (req, res) => {
  if (!ipAllowed(req)) return res.status(403).send('forbidden');
  const { chatwork_token, room_id } = readSecrets();
  if (!chatwork_token || !room_id) return res.status(400).send('未設定: トークン/ルームID');
  try {
    const body = `【テスト】院内ルール通知リレーの動作確認\n${new Date().toISOString()}`;
    await sendChatwork({ chatwork_token, room_id, body });
    res.status(200).send('OK');
  } catch (e) {
    console.error('test error', e.status || '', e.message);
    res.status(500).send('NG');
  }
});

app.post('/notify', async (req, res) => {
  if (!ipAllowed(req)) return res.status(403).send('forbidden');
  const s = readSecrets();
  const sig = req.header('x-signature') || req.header('X-Signature') || '';
  const expected = 'sha256=' + crypto.createHmac('sha256', String(s.relay_secret || '')).update(req.rawBody || '').digest('hex');
  if (!s.relay_secret || sig !== expected) return res.status(401).send('unauthorized');

  const { repo, event, pr, commit, pages_url, text, room_id: roomFromPayload } = req.body || {};
  const room_id = s.room_id || String(roomFromPayload || '');
  const chatwork_token = s.chatwork_token;
  if (!chatwork_token || !room_id) return res.status(400).send('未設定: トークン/ルームID');

  const linkPR = pr ? `https://github.com/${repo}/pull/${pr}` : '';
  const linkCommit = commit ? `https://github.com/${repo}/commit/${commit}` : '';
  const linkSite = pages_url || '';

  const lines = [];
  if (event === 'reminder') {
    lines.push('【未レビューPR リマインダー】');
    lines.push(text || '（該当なし）');
  } else if (event === 'pull_request') {
    lines.push('【ルール改定】PRが承認/マージされました');
    if (linkPR) lines.push(linkPR);
  } else {
    lines.push('【ルール更新】mainへ反映されました');
  }
  if (linkCommit) lines.push(linkCommit);
  if (linkSite) lines.push('公開サイト: ' + linkSite);
  lines.push('周知と現場反映をお願いします。');
  const body = lines.join('\n');

  try {
    await sendChatwork({ chatwork_token, room_id, body });
    res.status(200).send('ok');
  } catch (e) {
    console.error('notify error', e.status || '', e.message);
    res.status(500).send('error');
  }
});

async function sendChatwork({ chatwork_token, room_id, body }) {
  const url = `https://api.chatwork.com/v2/rooms/${encodeURIComponent(room_id)}/messages`;
  const form = new URLSearchParams();
  form.set('body', body);
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'X-ChatWorkToken': chatwork_token, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString()
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`chatwork post failed: ${resp.status} ${t.slice(0,200)}`);
  }
}

const port = Number(process.env.PORT || 8080);
app.listen(port, () => {
  console.log('relay listening on :' + port);
});
