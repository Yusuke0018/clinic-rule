/* eslint-disable no-console */
const express = require("express");
const basicAuth = require("express-basic-auth");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const cors = require("cors");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const fetch = (...args) =>
  import("node-fetch").then(({ default: f }) => f(...args));

const app = express();
app.set(
  "trust proxy",
  process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : 1,
);
app.use(helmet());
app.use(
  cors({
    origin: (origin, cb) => cb(null, true),
    credentials: false,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  }),
);

// keep raw body for HMAC verification
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
);

const limiter = rateLimit({ windowMs: 60 * 1000, max: 60 });
app.use(limiter);

const dataDir = __dirname;
const secretPath = path.join(dataDir, "secrets.json");
const likesPath = path.join(dataDir, "likes.json");
const proposalsPath = path.join(dataDir, "proposals.json");
const commentsPath = path.join(dataDir, "comments.json");

function readSecrets() {
  try {
    const s = JSON.parse(fs.readFileSync(secretPath, "utf8"));
    return s || {};
  } catch (_e) {
    return {};
  }
}

// ENV優先で設定を取得（RenderのEnvironment Variablesを上書き使用）
function getSecrets() {
  const s = readSecrets();
  const env = process.env || {};
  if (env.GITHUB_TOKEN) s.github_token = env.GITHUB_TOKEN;
  if (env.GITHUB_REPO) s.github_repo = env.GITHUB_REPO;
  if (env.RELAY_SECRET) s.relay_secret = env.RELAY_SECRET;
  if (env.CHATWORK_TOKEN) s.chatwork_token = env.CHATWORK_TOKEN;
  if (env.ROOM_ID) s.room_id = env.ROOM_ID;
  return s;
}
function writeSecrets(obj) {
  const json = JSON.stringify(obj, null, 2);
  fs.writeFileSync(secretPath, json, { encoding: "utf8", mode: 0o600 });
  try {
    fs.chmodSync(secretPath, 0o600);
  } catch (_e) {}
}

function readLikes() {
  try {
    return JSON.parse(fs.readFileSync(likesPath, "utf8")) || {};
  } catch (_e) {
    return {};
  }
}
function writeLikes(obj) {
  fs.writeFileSync(likesPath, JSON.stringify(obj, null, 2), {
    encoding: "utf8",
  });
}
function readProposals() {
  try {
    return JSON.parse(fs.readFileSync(proposalsPath, "utf8")) || {};
  } catch (_e) {
    return {};
  }
}
function writeProposals(obj) {
  fs.writeFileSync(proposalsPath, JSON.stringify(obj, null, 2), {
    encoding: "utf8",
  });
}

function readCommentsMap() {
  try {
    return JSON.parse(fs.readFileSync(commentsPath, "utf8")) || {};
  } catch (_e) {
    return {};
  }
}
function writeCommentsMap(obj) {
  fs.writeFileSync(commentsPath, JSON.stringify(obj, null, 2), {
    encoding: "utf8",
  });
}

function genSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

function ipAllowed(req) {
  const allow = (process.env.ALLOWED_IPS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allow.length === 0) return true;
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "")
    .toString()
    .split(",")[0]
    .trim();
  return allow.includes(ip);
}

// Basic auth for admin
const adminAuth = basicAuth({
  users: {
    [process.env.BASIC_USER || "admin"]: process.env.BASIC_PASS || "change-me",
  },
  challenge: true,
});

app.get("/healthz", (_req, res) => res.status(200).send("ok"));
// RenderのデフォルトHealth Check対策としてルートも200を返す
app.get("/", (_req, res) => res.status(200).send("ok"));

app.get("/admin", adminAuth, (req, res) => {
  if (!ipAllowed(req)) return res.status(403).send("forbidden");
  const {
    chatwork_token = "",
    room_id = "",
    relay_secret = "",
    github_token = "",
    github_repo = "",
  } = getSecrets();
  const mask = (v) => (v ? v.slice(0, 3) + "***" + v.slice(-3) : "");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>院内ルール リレー設定</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:sans-serif;max-width:720px;margin:24px auto;padding:0 12px}label{display:block;margin:.5rem 0 .25rem}input[type=text],input[type=password]{width:100%;padding:.5rem}button{padding:.5rem 1rem;margin-right:.5rem}</style></head><body>
  <h1>院内ルール リレー設定</h1>
  <form method="post" action="/admin/save">
    <label>Chatworkトークン</label>
    <input type="password" name="chatwork_token" placeholder="xxxxxxxx" value="" />
    <small>保存済み: ${mask(chatwork_token) || "未設定"}</small>
    <label>チャットルームID</label>
    <input type="text" name="room_id" value="${room_id || ""}" />
    <label>RELAY_SECRET（GitHub Secretsに貼り付け）</label>
    <input type="text" name="relay_secret" value="${relay_secret || ""}" />
    <hr />
    <label>GitHub Token（Issue作成用・repo権限）</label>
    <input type="password" name="github_token" value="" />
    <small>保存済み: ${mask(github_token) || "未設定"}</small>
    <label>GitHub Repo（owner/repo）例: Yusuke0018/clinic-rule</label>
    <input type="text" name="github_repo" value="${github_repo || ""}" />
    <div style="margin-top:8px">
      <button type="submit">保存</button>
      <button formaction="/admin/gen-secret" formmethod="post">RELAY_SECRET自動生成</button>
      <button formaction="/admin/test" formmethod="post">テスト送信</button>
    </div>
  </form>
  <p>注意: トークンはサーバーのsecrets.jsonにのみ保存され、ログ出力しません。</p>
  </body></html>`);
});

app.post("/admin/gen-secret", adminAuth, (req, res) => {
  if (!ipAllowed(req)) return res.status(403).send("forbidden");
  const s = readSecrets();
  s.relay_secret = genSecret(32);
  writeSecrets(s);
  res.redirect("/admin");
});

// urlencoded for admin posts
app.use(express.urlencoded({ extended: false }));

app.post("/admin/save", adminAuth, (req, res) => {
  if (!ipAllowed(req)) return res.status(403).send("forbidden");
  const s = readSecrets();
  if (req.body.chatwork_token) s.chatwork_token = req.body.chatwork_token;
  if (req.body.room_id !== undefined)
    s.room_id = String(req.body.room_id || "");
  if (req.body.relay_secret) s.relay_secret = req.body.relay_secret;
  if (req.body.github_token) s.github_token = req.body.github_token;
  if (req.body.github_repo !== undefined)
    s.github_repo = String(req.body.github_repo || "");
  if (!s.relay_secret) s.relay_secret = genSecret(32);
  writeSecrets(s);
  res.redirect("/admin");
});

app.post("/admin/test", adminAuth, async (req, res) => {
  if (!ipAllowed(req)) return res.status(403).send("forbidden");
  const { chatwork_token, room_id } = getSecrets();
  if (!chatwork_token || !room_id)
    return res.status(400).send("未設定: トークン/ルームID");
  try {
    const body = `【テスト】院内ルール通知リレーの動作確認\n${new Date().toISOString()}`;
    await sendChatwork({ chatwork_token, room_id, body });
    res.status(200).send("OK");
  } catch (e) {
    console.error("test error", e.status || "", e.message);
    // エラー詳細を返して原因特定を容易にする
    res
      .status(500)
      .send(
        "NG: Chatwork APIへの送信に失敗しました。トークン/ルームID/ネットワークを確認してください。" +
          (e && e.message
            ? `\nreason: ${String(e.message).slice(0, 300)}`
            : ""),
      );
  }
});

app.post("/notify", async (req, res) => {
  if (!ipAllowed(req)) return res.status(403).send("forbidden");
  const s = getSecrets();
  const sig = req.header("x-signature") || req.header("X-Signature") || "";
  const expected =
    "sha256=" +
    crypto
      .createHmac("sha256", String(s.relay_secret || ""))
      .update(req.rawBody || "")
      .digest("hex");
  if (!s.relay_secret || sig !== expected)
    return res.status(401).send("unauthorized");

  const {
    repo,
    event,
    pr,
    commit,
    pages_url,
    text,
    room_id: roomFromPayload,
  } = req.body || {};
  const room_id = s.room_id || String(roomFromPayload || "");
  const chatwork_token = s.chatwork_token;
  if (!chatwork_token || !room_id)
    return res.status(400).send("未設定: トークン/ルームID");

  const linkPR = pr ? `https://github.com/${repo}/pull/${pr}` : "";
  const linkCommit = commit
    ? `https://github.com/${repo}/commit/${commit}`
    : "";
  const linkSite = pages_url || "";

  const lines = [];
  if (event === "reminder") {
    lines.push("【未レビューPR リマインダー】");
    lines.push(text || "（該当なし）");
  } else if (event === "pull_request") {
    lines.push("【ルール改定】PRが承認/マージされました");
    if (linkPR) lines.push(linkPR);
  } else {
    lines.push("【ルール更新】mainへ反映されました");
  }
  if (linkCommit) lines.push(linkCommit);
  if (linkSite) lines.push("公開サイト: " + linkSite);
  lines.push("周知と現場反映をお願いします。");
  const body = lines.join("\n");

  try {
    await sendChatwork({ chatwork_token, room_id, body });
    res.status(200).send("ok");
  } catch (e) {
    console.error("notify error", e.status || "", e.message);
    res.status(500).send("error");
  }
});

async function sendChatwork({ chatwork_token, room_id, body }) {
  const url = `https://api.chatwork.com/v2/rooms/${encodeURIComponent(room_id)}/messages`;
  const form = new URLSearchParams();
  form.set("body", body);
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "X-ChatWorkToken": chatwork_token,
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
      "User-Agent":
        "clinic-rule-relay/1.0 (+https://github.com/Yusuke0018/clinic-rule)",
    },
    body: form.toString(),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`chatwork post failed: ${resp.status} ${t.slice(0, 200)}`);
  }
}

// Submit proposal (no GitHub account needed): creates Issue in configured repo
app.post("/proposal", async (req, res) => {
  try {
    const s = getSecrets();
    const { github_token, github_repo } = s;
    if (!github_token || !github_repo)
      return res.status(400).json({ error: "not_configured" });
    const { title, reason, author } = req.body || {};
    if (!title || !reason || !author)
      return res.status(400).json({ error: "invalid_params" });
    if (String(title).length > 200)
      return res.status(400).json({ error: "title_too_long" });
    const [owner, repo] = String(github_repo).split("/");
    const body = [
      `### 内容や理由`,
      String(reason),
      ``,
      `### 登録者`,
      String(author),
    ].join("\n");
    const resp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${github_token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "clinic-rule-relay",
        },
        body: JSON.stringify({
          title: `[提案] ${title}`.slice(0, 250),
          body,
          labels: ["proposal"],
        }),
      },
    );
    const json = await resp.json();
    if (!resp.ok)
      return res.status(resp.status).json({ error: "gh_error", details: json });
    // 保存: 撤回トークン
    const token = genSecret(16);
    const map = readProposals();
    map[String(json.number)] = { token, created_at: Date.now() };
    writeProposals(map);
    return res
      .status(200)
      .json({ number: json.number, url: json.html_url, token });
  } catch (e) {
    console.error("proposal error", e.message);
    return res.status(500).json({ error: "server_error" });
  }
});

// Withdraw proposal: POST {number, token}
app.post("/proposal/withdraw", async (req, res) => {
  try {
    const s = getSecrets();
    const { github_token, github_repo } = s;
    if (!github_token || !github_repo)
      return res.status(400).json({ error: "not_configured" });
    const { number, token } = req.body || {};
    const n = String(number || "").trim();
    const t = String(token || "").trim();
    if (!n || !t) return res.status(400).json({ error: "invalid_params" });
    const map = readProposals();
    if (!map[n] || map[n].token !== t)
      return res.status(403).json({ error: "forbidden" });
    const [owner, repo] = String(github_repo).split("/");
    // close issue, redact body, lock
    const gh = async (method, path, body) => {
      const r = await fetch(
        `https://api.github.com/repos/${owner}/${repo}${path}`,
        {
          method,
          headers: {
            Authorization: `Bearer ${github_token}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
            "User-Agent": "clinic-rule-relay",
          },
          body: body ? JSON.stringify(body) : undefined,
        },
      );
      if (!r.ok) throw new Error(`gh ${method} ${path} ${r.status}`);
      return r.json();
    };
    // Get current issue to prefix title
    let title = `#${n}`;
    try {
      const cur = await gh("GET", `/issues/${n}`);
      title = cur.title || title;
    } catch {}
    await gh("PATCH", `/issues/${n}`, {
      title: `[削除] ${title}`.slice(0, 250),
      body: `この提案は送信者によって削除されました。`,
      state: "closed",
    });
    try {
      await gh("PUT", `/issues/${n}/lock`, { lock_reason: "resolved" });
    } catch {}
    // remove mapping
    delete map[n];
    writeProposals(map);
    return res.json({ ok: true });
  } catch (e) {
    console.error("withdraw error", e.message);
    return res.status(500).json({ error: "server_error" });
  }
});

// Add a comment to an issue (for opinions without GitHub account)
// POST {issue:number, author:string, body:string}
app.post("/comment", async (req, res) => {
  try {
    const s = getSecrets();
    const { github_token, github_repo } = s;
    if (!github_token || !github_repo)
      return res.status(400).json({ error: "not_configured" });
    const { issue, author, body } = req.body || {};
    const n = Number(issue || 0);
    if (!n || !body) return res.status(400).json({ error: "invalid_params" });
    const [owner, repo] = String(github_repo).split("/");
    const content = [
      author ? `【投稿者】${String(author).trim()}` : "【投稿者】（未記入）",
      "",
      String(body).trim(),
    ].join("\n");
    const resp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${n}/comments`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${github_token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "clinic-rule-relay",
        },
        body: JSON.stringify({ body: content }),
      },
    );
    const json = await resp.json();
    if (!resp.ok)
      return res
        .status(resp.status)
        .json({ error: "gh_error", details: json && json.message });

    // store deletion token for this comment
    const token = genSecret(16);
    const map = readCommentsMap();
    map[String(json.id)] = { token, issue: n, created_at: Date.now() };
    writeCommentsMap(map);
    return res.json({ ok: true, id: json.id, url: json.html_url, token });
  } catch (e) {
    console.error("comment error", e.message);
    return res.status(500).json({ error: "server_error" });
  }
});

// Edit a comment (token-protected)
// POST {id:number, token:string, author?:string, body:string}
app.post("/comment/edit", async (req, res) => {
  try {
    const s = getSecrets();
    const { github_token, github_repo } = s;
    if (!github_token || !github_repo)
      return res.status(400).json({ error: "not_configured" });
    const { id, token, author, body } = req.body || {};
    const cid = String(id || "").trim();
    if (!cid || !token || !body)
      return res.status(400).json({ error: "invalid_params" });
    const map = readCommentsMap();
    if (!map[cid] || map[cid].token !== token)
      return res.status(403).json({ error: "forbidden" });
    const [owner, repo] = String(github_repo).split("/");
    const content = [
      author ? `【投稿者】${String(author).trim()}` : "【投稿者】（未記入）",
      "",
      String(body).trim(),
    ].join("\n");
    const r = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/comments/${cid}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${github_token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "clinic-rule-relay",
        },
        body: JSON.stringify({ body: content }),
      },
    );
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`gh patch ${r.status} ${t}`);
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error("comment edit error", e.message);
    return res.status(500).json({ error: "server_error" });
  }
});

// Delete a comment (token-protected)
// POST {id:number, token:string}
app.post("/comment/delete", async (req, res) => {
  try {
    const s = getSecrets();
    const { github_token, github_repo } = s;
    if (!github_token || !github_repo)
      return res.status(400).json({ error: "not_configured" });
    const { id, token } = req.body || {};
    const cid = String(id || "").trim();
    const map = readCommentsMap();
    if (!cid || !token || !map[cid] || map[cid].token !== token)
      return res.status(403).json({ error: "forbidden" });
    const [owner, repo] = String(github_repo).split("/");
    const r = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/comments/${cid}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${github_token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "clinic-rule-relay",
        },
      },
    );
    if (r.status !== 204) {
      const t = await r.text();
      throw new Error(`gh delete ${r.status} ${t}`);
    }
    delete map[cid];
    writeCommentsMap(map);
    return res.json({ ok: true });
  } catch (e) {
    console.error("comment delete error", e.message);
    return res.status(500).json({ error: "server_error" });
  }
});

// Edit proposal: POST {number, token, title, reason, author}
app.post("/proposal/edit", async (req, res) => {
  try {
    const s = getSecrets();
    const { github_token, github_repo } = s;
    if (!github_token || !github_repo)
      return res.status(400).json({ error: "not_configured" });
    const { number, token, title, reason, author } = req.body || {};
    const n = String(number || "").trim();
    const t = String(token || "").trim();
    if (!n || !t || !title || !reason || !author)
      return res.status(400).json({ error: "invalid_params" });
    const map = readProposals();
    if (!map[n] || map[n].token !== t)
      return res.status(403).json({ error: "forbidden" });
    const [owner, repo] = String(github_repo).split("/");
    const gh = async (method, path, body) => {
      const r = await fetch(
        `https://api.github.com/repos/${owner}/${repo}${path}`,
        {
          method,
          headers: {
            Authorization: `Bearer ${github_token}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
            "User-Agent": "clinic-rule-relay",
          },
          body: body ? JSON.stringify(body) : undefined,
        },
      );
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`gh ${method} ${path} ${r.status} ${txt}`);
      }
      return r.json();
    };
    const body = [
      `### 内容や理由`,
      String(reason),
      ``,
      `### 登録者`,
      String(author),
    ].join("\n");
    const resp = await gh("PATCH", `/issues/${n}`, {
      title: `[提案] ${String(title)}`.slice(0, 250),
      body,
    });
    return res.json({ ok: true, url: resp.html_url });
  } catch (e) {
    console.error("edit error", e.message);
    return res.status(500).json({ error: "server_error" });
  }
});

// Likes: GET /likes?issues=1,2,3 returns {"1":10,...}
app.get("/likes", (req, res) => {
  const q = String(req.query.issues || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const all = readLikes();
  const out = {};
  for (const id of q) out[id] = (all[id] && all[id].count) || 0;
  res.json(out);
});

// Like one: POST {issue:number, uid:string}
app.post("/like", (req, res) => {
  try {
    const { issue, uid } = req.body || {};
    const id = String(issue || "").trim();
    const u = String(uid || "").trim();
    if (!id || !u) return res.status(400).json({ error: "invalid_params" });
    const all = readLikes();
    if (!all[id]) all[id] = { count: 0, uids: {} };
    const bucket = all[id];
    const key = crypto
      .createHash("sha256")
      .update("salt::" + u)
      .digest("hex");
    if (bucket.uids[key])
      return res.json({ ok: true, dup: true, count: bucket.count });
    bucket.uids[key] = 1;
    bucket.count += 1;
    writeLikes(all);
    return res.json({ ok: true, count: bucket.count });
  } catch (e) {
    console.error("like error", e.message);
    return res.status(500).json({ error: "server_error" });
  }
});

const port = Number(process.env.PORT || 8080);
app.listen(port, () => {
  console.log("relay listening on :" + port);
});
