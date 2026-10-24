#!/usr/bin/env node
// Threads CLI for Yomates — 내 스레드 계정에 글을 올리고, 답글을 달고, 최근 글과 댓글을 본다.
// 설치할 것 없음: Node.js 18 이상만 있으면 된다(외부 패키지 0개).
//
// 토큰은 내 컴퓨터의 ~/.yomates-threads/config.json 에만 저장한다(내 계정만 읽기 권한).
// 토큰 값은 화면에 절대 출력하지 않는다. 토큰은 클립보드에서 바로 읽어 저장한다 — 채팅에 붙여 넣지 않는다.
//
// 처음 한 번
//   node threads.mjs secret --from-clipboard   (선택) Meta 앱 시크릿 키를 복사해 둔 상태에서
//   node threads.mjs setup  --from-clipboard   Meta '사용자 토큰 생성기'에서 복사한 토큰 저장 → 60일짜리로 바꿈
//   node threads.mjs status                     연결된 계정과 토큰 남은 날
//
// 쓰기
//   node threads.mjs post "본문" [--link URL] [--image URL]   글 올리기(링크는 첫 댓글로 분리)
//   node threads.mjs reply <글ID> "본문"                       답글
//   node threads.mjs delete <글ID>                             삭제
//   node threads.mjs recent [N] [--metrics]                    내 최근 글
//   node threads.mjs metrics <글ID>                            조회수·좋아요·답글·리포스트
//   node threads.mjs scan [N]                                  내 글에 달린 남의 댓글
//   node threads.mjs refresh                                   토큰 연장(보통 저절로 함)
//   node threads.mjs logout                                    이 컴퓨터에서 토큰 지우기
//
// 토큰은 60일 쓴다. 남은 날이 10일 아래로 내려가면 명령을 쓸 때 저절로 60일로 다시 늘린다.
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, chmodSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

const GRAPH = "https://graph.threads.net/v1.0";
const DIR = join(homedir(), ".yomates-threads");
const FILE = join(DIR, "config.json");
const DAY = 86400000;

function load() { try { return JSON.parse(readFileSync(FILE, "utf8")); } catch { return {}; } }
function save(c) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(c, null, 2));
  try { chmodSync(DIR, 0o700); chmodSync(FILE, 0o600); } catch {}
}
function clipboard() {
  const os = platform();
  const cmd = os === "darwin" ? "pbpaste" : os === "win32" ? 'powershell -NoProfile -Command "Get-Clipboard"' : "xclip -selection clipboard -o 2>/dev/null || wl-paste";
  const v = execSync(cmd, { encoding: "utf8" }).trim();
  // 다 읽은 뒤 클립보드를 비운다
  try {
    if (os === "darwin") execSync("pbcopy < /dev/null");
    else if (os === "win32") execSync('powershell -NoProfile -Command "Set-Clipboard -Value $null"');
  } catch {}
  return v;
}
const out = (o) => console.log(JSON.stringify(o, null, 2));

async function call(method, path, params = {}, tok) {
  const url = new URL(GRAPH + path);
  let body;
  if (method === "GET" || method === "DELETE") {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("access_token", tok);
  } else body = new URLSearchParams({ ...params, access_token: tok });
  const r = await fetch(url, { method, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j?.error?.message || `${method} ${path} ${r.status}`;
    // 토큰 문제면 다시 연결하라고 알려 준다
    if (j?.error?.code === 190 || /token/i.test(msg)) throw new Error(`토큰이 만료됐거나 맞지 않아요. 'setup --from-clipboard'로 다시 연결해 주세요. (${msg})`);
    throw new Error(msg);
  }
  return j;
}
const exchangeUrl = (secret, short) => `https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${encodeURIComponent(secret)}&access_token=${encodeURIComponent(short)}`;
const refreshUrl = (tok) => `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(tok)}`;

async function refresh(c, force = false) {
  const left = (c.expiresAt || 0) - Date.now();
  const age = Date.now() - (c.savedAt || 0);
  if (!force && left > 10 * DAY) return c;
  if (age < DAY && !force) return c;   // 받은 지 하루가 안 된 토큰은 연장할 수 없다
  const r = await fetch(refreshUrl(c.accessToken));
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) { if (force) throw new Error(j?.error?.message || "연장 실패"); return c; }
  const next = { ...c, accessToken: j.access_token, expiresAt: Date.now() + (j.expires_in || 60 * 86400) * 1000, savedAt: Date.now() };
  save(next);
  return next;
}

async function ready() {
  let c = load();
  if (!c.accessToken) throw new Error("아직 연결되지 않았어요. 'node threads.mjs setup --from-clipboard'를 먼저 해 주세요.");
  c = await refresh(c);
  return c;
}

// 컨테이너를 만들고 → 준비될 때까지 기다렸다가 → 발행. replyToId 가 있으면 답글.
async function publish({ text, imageUrl, replyToId }, tok) {
  if (text && [...text].length > 500) throw new Error(`본문이 ${[...text].length}자예요. 500자까지 쓸 수 있어요.`);
  const media = {
    ...(imageUrl ? { media_type: "IMAGE", image_url: imageUrl } : { media_type: "TEXT" }),
    ...(text ? { text } : {}),
    ...(replyToId ? { reply_to_id: replyToId } : {}),
  };
  const { id: creationId } = await call("POST", "/me/threads", media, tok);
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const s = await call("GET", `/${creationId}`, { fields: "status,error_message" }, tok).catch(() => ({}));
    if (s.status === "FINISHED") break;
    if (s.status === "ERROR") throw new Error(`올릴 준비 중 오류: ${s.error_message}`);
  }
  const { id } = await call("POST", "/me/threads_publish", { creation_id: creationId }, tok);
  return id;
}

const flag = (args, name) => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : null; };
const [cmd, ...rest] = process.argv.slice(2);

try {
  if (cmd === "secret") {
    if (!rest.includes("--from-clipboard")) throw new Error("앱 시크릿 키를 복사한 뒤 'secret --from-clipboard'로 실행해 주세요.");
    const v = clipboard();
    if (!/^[0-9a-f]{32}$/i.test(v)) throw new Error("클립보드 값이 앱 시크릿 키 모양(32자리)이 아니에요. 다시 복사해 주세요.");
    save({ ...load(), appSecret: v });
    out({ ok: true, saved: "app secret (토큰을 60일짜리로 바꿀 때 한 번 쓰고 지워요)" });
  }
  else if (cmd === "setup") {
    if (!rest.includes("--from-clipboard")) throw new Error("토큰을 복사한 뒤 'setup --from-clipboard'로 실행해 주세요. 토큰을 채팅에 붙여 넣지 마세요.");
    let tok = clipboard().replace(/\s+/g, "");
    if (tok.length < 50) throw new Error("클립보드 값이 토큰 모양이 아니에요. Meta 화면에서 토큰을 다시 복사해 주세요.");
    const c = load();
    let expiresAt = Date.now() + 60 * DAY, how = "생성기 토큰을 그대로 저장(60일로 봄)";
    if (c.appSecret) {
      const r = await fetch(exchangeUrl(c.appSecret, tok));
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.access_token) { tok = j.access_token; expiresAt = Date.now() + (j.expires_in || 60 * 86400) * 1000; how = "60일 토큰으로 바꿔 저장"; }
    }
    const me = await call("GET", "/me", { fields: "id,username" }, tok);
    const { appSecret, ...keep } = c;   // 시크릿은 다 썼으니 지운다
    save({ ...keep, accessToken: tok, userId: me.id, username: me.username, expiresAt, savedAt: Date.now() });
    out({ ok: true, account: `@${me.username}`, how, daysLeft: Math.round((expiresAt - Date.now()) / DAY) });
  }
  else if (cmd === "status") {
    const c = load();
    if (!c.accessToken) out({ connected: false, next: "setup --from-clipboard" });
    else {
      const me = await call("GET", "/me", { fields: "username" }, c.accessToken).catch((e) => ({ error: e.message }));
      out({ connected: !me.error, account: c.username ? `@${c.username}` : null, daysLeft: Math.round(((c.expiresAt || 0) - Date.now()) / DAY), ...(me.error ? { error: me.error } : {}) });
    }
  }
  else if (cmd === "refresh") {
    const c = await refresh(load(), true);
    out({ ok: true, daysLeft: Math.round((c.expiresAt - Date.now()) / DAY) });
  }
  else if (cmd === "logout") {
    if (existsSync(FILE)) rmSync(FILE);
    out({ ok: true, removed: FILE });
  }
  else if (cmd === "post") {
    const c = await ready();
    const text = rest[0];
    if (!text || text.startsWith("--")) throw new Error('본문이 필요해요: post "본문" [--link URL] [--image URL]');
    const link = flag(rest, "--link"), image = flag(rest, "--image");
    const postId = await publish({ text, imageUrl: image }, c.accessToken);
    let commentId = null;
    if (link) commentId = await publish({ text: link, replyToId: postId }, c.accessToken).catch((e) => { console.error("첫 댓글(링크) 실패:", e.message); return null; });
    const p = await call("GET", `/${postId}`, { fields: "permalink" }, c.accessToken).catch(() => ({}));
    out({ ok: true, postId, commentId, permalink: p.permalink || null });
  }
  else if (cmd === "reply") {
    const c = await ready();
    const [parentId, text] = rest;
    if (!parentId || !text) throw new Error('사용법: reply <글ID> "본문"');
    out({ ok: true, replyId: await publish({ text, replyToId: parentId }, c.accessToken) });
  }
  else if (cmd === "delete") {
    const c = await ready();
    if (!rest[0]) throw new Error("사용법: delete <글ID>");
    await call("DELETE", `/${rest[0]}`, {}, c.accessToken);
    out({ ok: true, deleted: rest[0] });
  }
  else if (cmd === "recent") {
    const c = await ready();
    const n = Number(rest[0]) || 10, withM = rest.includes("--metrics");
    const me = await call("GET", "/me/threads", { fields: "id,text,permalink,timestamp", limit: String(n) }, c.accessToken);
    const rows = [];
    for (const p of me.data || []) {
      const row = { id: p.id, at: p.timestamp, text: (p.text || "").slice(0, 60), permalink: p.permalink };
      if (withM) {
        const ins = await call("GET", `/${p.id}/insights`, { metric: "views,likes,replies,reposts,quotes" }, c.accessToken).catch(() => null);
        for (const m of ins?.data || []) row[m.name] = m.values?.[0]?.value ?? m.total_value?.value ?? 0;
      }
      rows.push(row);
    }
    out(rows);
  }
  else if (cmd === "metrics") {
    const c = await ready();
    if (!rest[0]) throw new Error("사용법: metrics <글ID>");
    const ins = await call("GET", `/${rest[0]}/insights`, { metric: "views,likes,replies,reposts,quotes" }, c.accessToken);
    const o = {};
    for (const m of ins.data || []) o[m.name] = m.values?.[0]?.value ?? m.total_value?.value ?? 0;
    out(o);
  }
  else if (cmd === "scan") {
    const c = await ready();
    const n = Number(rest[0]) || 10;
    const me = await call("GET", "/me/threads", { fields: "id,text,timestamp", limit: String(n) }, c.accessToken);
    const rows = [];
    for (const p of me.data || []) {
      const rep = await call("GET", `/${p.id}/replies`, { fields: "id,text,username,timestamp", limit: "25" }, c.accessToken).catch(() => ({ data: [] }));
      for (const r of rep.data || []) if (r.username && r.username !== c.username) rows.push({ commentId: r.id, on: (p.text || "").slice(0, 30), by: r.username, text: r.text, at: r.timestamp });
    }
    out(rows);
  }
  else {
    console.log(`Threads CLI for Yomates
  setup --from-clipboard              토큰 연결(처음 한 번)
  secret --from-clipboard             (선택) 앱 시크릿 키 — setup 전에
  status                              연결 상태, 토큰 남은 날
  post "본문" [--link URL] [--image URL]
  reply <글ID> "본문"
  delete <글ID>
  recent [N] [--metrics]
  metrics <글ID>
  scan [N]
  refresh | logout`);
  }
} catch (e) {
  console.error("ERROR:", e.message);
  process.exit(1);
}
