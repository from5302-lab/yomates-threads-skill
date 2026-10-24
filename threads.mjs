#!/usr/bin/env node
// Threads CLI for Yomates — 내 스레드 계정에 글을 올리고, 답글을 달고, 최근 글과 댓글을 본다.
// 설치할 것 없음: Node.js 18 이상만 있으면 된다(외부 패키지 0개).
//
// 토큰은 맥이면 키체인, 윈도우면 내 계정만 풀 수 있는 암호화 파일, 리눅스면 내 계정만 읽는 파일에 둔다.
// 토큰 값은 화면에 절대 출력하지 않는다. 클립보드에서 한 번 읽어 바로 저장하고 클립보드를 비운다 — 채팅에 붙여 넣지 않는다.
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
import { execSync, spawnSync } from "node:child_process";

const GRAPH = "https://graph.threads.net/v1.0";
const DIR = process.env.YOMATES_THREADS_DIR || join(homedir(), ".yomates-threads");   // 시험할 때만 바꾼다
const FILE = join(DIR, "config.json");
const DAY = 86400000;

function load() { try { return JSON.parse(readFileSync(FILE, "utf8")); } catch { return {}; } }
function save(c) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(c, null, 2));
  try { chmodSync(DIR, 0o700); chmodSync(FILE, 0o600); } catch {}
}
// ===== 비밀값 보관 (2026-10 보안 강화) =====
// 맥: 키체인(macOS Keychain) / 윈도우: 내 계정만 풀 수 있는 암호화(DPAPI) 파일 / 리눅스: 내 계정만 읽는 파일(600)
// 값은 명령 인자로 넘기지 않는다(다른 프로그램의 프로세스 목록에 보일 수 있음). 표준입력으로만 넘긴다.
const KC_SERVICE = process.env.YOMATES_KC_SERVICE || "yomates-threads";
function vaultSet(name, value) {
  const os = platform();
  if (os === "darwin") {
    const esc = (v) => String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const r = spawnSync("security", ["-i"], { input: `add-generic-password -U -a "${esc(name)}" -s "${KC_SERVICE}" -w "${esc(value)}"\n`, encoding: "utf8" });
    if (r.status !== 0) throw new Error("키체인에 저장하지 못했어요.");
    return;
  }
  if (os === "win32") {
    const r = spawnSync("powershell", ["-NoProfile", "-Command", "$v=[Console]::In.ReadToEnd(); ConvertTo-SecureString $v -AsPlainText -Force | ConvertFrom-SecureString"], { input: String(value), encoding: "utf8" });
    if (r.status !== 0) throw new Error("암호화해서 저장하지 못했어요.");
    const c = load(); save({ ...c, enc: { ...(c.enc || {}), [name]: r.stdout.trim() } });
    return;
  }
  const c = load(); save({ ...c, plain: { ...(c.plain || {}), [name]: String(value) } });
}
function vaultGet(name) {
  const os = platform();
  if (os === "darwin") {
    const r = spawnSync("security", ["find-generic-password", "-a", name, "-s", KC_SERVICE, "-w"], { encoding: "utf8" });
    return r.status === 0 ? r.stdout.replace(/\n$/, "") : "";
  }
  if (os === "win32") {
    const e = (load().enc || {})[name];
    if (!e) return "";
    const r = spawnSync("powershell", ["-NoProfile", "-Command", "$s=[Console]::In.ReadToEnd().Trim() | ConvertTo-SecureString; [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))"], { input: e, encoding: "utf8" });
    return r.status === 0 ? r.stdout.replace(/\r?\n$/, "") : "";
  }
  return (load().plain || {})[name] || "";
}
function vaultDel(name) {
  if (platform() === "darwin") spawnSync("security", ["delete-generic-password", "-a", name, "-s", KC_SERVICE], { encoding: "utf8" });
}
const vaultWhere = () => (platform() === "darwin" ? "맥 키체인" : platform() === "win32" ? "윈도우 암호화(DPAPI) 파일" : "내 계정만 읽는 파일(600)");

// 클립보드에서 한 번만 읽는다. 지금 클립보드 값이 모양에 안 맞으면 waitSec 동안 새로 복사되기를 기다린다.
// 읽은 뒤에는 바로 비운다. 값은 화면에 출력하지 않는다.
function readClipboardRaw() {
  const os = platform();
  const cmd = os === "darwin" ? "pbpaste" : os === "win32" ? 'powershell -NoProfile -Command "Get-Clipboard"' : "xclip -selection clipboard -o 2>/dev/null || wl-paste";
  try { return execSync(cmd, { encoding: "utf8" }).trim(); } catch { return ""; }
}
function clearClipboard() {
  const os = platform();
  try {
    if (os === "darwin") execSync("pbcopy < /dev/null");
    else if (os === "win32") execSync('powershell -NoProfile -Command "Set-Clipboard -Value $null"');
    else execSync("xclip -selection clipboard < /dev/null 2>/dev/null || wl-copy --clear");
  } catch {}
}
async function clipboardSecret(test, waitSec = 90) {
  const until = Date.now() + waitSec * 1000;
  let v = readClipboardRaw().replace(/\s+/g, "");
  while (!test(v) && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 1000));
    v = readClipboardRaw().replace(/\s+/g, "");
  }
  clearClipboard();
  if (!test(v)) throw new Error(`${waitSec}초 안에 맞는 값이 복사되지 않았어요. 복사 버튼을 누른 뒤 다시 실행해 주세요.`);
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

// 예전 판(평문 config.json)에 토큰이 있으면 금고로 옮기고 파일에서 지운다
function migrate() {
  const c = load();
  if (c.accessToken) { vaultSet("accessToken", c.accessToken); delete c.accessToken; save(c); }
  if (c.appSecret) { vaultSet("appSecret", c.appSecret); delete c.appSecret; save(c); }
  return load();
}
const token = () => vaultGet("accessToken");

async function refresh(c, force = false) {
  const left = (c.expiresAt || 0) - Date.now();
  const age = Date.now() - (c.savedAt || 0);
  if (!force && left > 10 * DAY) return c;
  if (age < DAY && !force) return c;   // 받은 지 하루가 안 된 토큰은 연장할 수 없다
  const r = await fetch(refreshUrl(token()));
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) { if (force) throw new Error(j?.error?.message || "연장 실패"); return c; }
  vaultSet("accessToken", j.access_token);
  const next = { ...load(), expiresAt: Date.now() + (j.expires_in || 60 * 86400) * 1000, savedAt: Date.now() };
  save(next);
  return next;
}

async function ready() {
  let c = migrate();
  if (!token()) throw new Error("아직 연결되지 않았어요. 'node threads.mjs setup --from-clipboard'를 먼저 해 주세요.");
  c = await refresh(c);
  return { ...c, accessToken: token() };
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
    const v = await clipboardSecret((x) => /^[0-9a-f]{32}$/i.test(x));
    vaultSet("appSecret", v);
    out({ ok: true, saved: `app secret → ${vaultWhere()} (토큰을 60일짜리로 바꿀 때 한 번 쓰고 지워요)` });
  }
  else if (cmd === "setup") {
    if (!rest.includes("--from-clipboard")) throw new Error("토큰을 복사한 뒤 'setup --from-clipboard'로 실행해 주세요. 토큰을 채팅에 붙여 넣지 마세요.");
    let tok = await clipboardSecret((x) => x.length >= 50 && /^[A-Za-z0-9]+$/.test(x));
    const c = migrate();
    const appSecret = vaultGet("appSecret");
    let expiresAt = Date.now() + 60 * DAY, how = "생성기 토큰을 그대로 저장(60일로 봄)";
    if (appSecret) {
      const r = await fetch(exchangeUrl(appSecret, tok));
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.access_token) { tok = j.access_token; expiresAt = Date.now() + (j.expires_in || 60 * 86400) * 1000; how = "60일 토큰으로 바꿔 저장"; }
    }
    const me = await call("GET", "/me", { fields: "id,username" }, tok);
    vaultSet("accessToken", tok);
    vaultDel("appSecret");   // 시크릿은 다 썼으니 지운다
    const keep = load(); if (keep.enc) delete keep.enc.appSecret; if (keep.plain) delete keep.plain.appSecret;
    save({ ...keep, userId: me.id, username: me.username, expiresAt, savedAt: Date.now() });
    out({ ok: true, account: `@${me.username}`, how, savedIn: vaultWhere(), daysLeft: Math.round((expiresAt - Date.now()) / DAY) });
  }
  else if (cmd === "status") {
    const c = migrate();
    if (!token()) out({ connected: false, next: "setup --from-clipboard" });
    else {
      const me = await call("GET", "/me", { fields: "username" }, token()).catch((e) => ({ error: e.message }));
      out({ connected: !me.error, account: c.username ? `@${c.username}` : null, savedIn: vaultWhere(), daysLeft: Math.round(((c.expiresAt || 0) - Date.now()) / DAY), ...(me.error ? { error: me.error } : {}) });
    }
  }
  else if (cmd === "refresh") {
    const c = await refresh(migrate(), true);
    out({ ok: true, daysLeft: Math.round((c.expiresAt - Date.now()) / DAY) });
  }
  else if (cmd === "logout") {
    vaultDel("accessToken"); vaultDel("appSecret");
    if (existsSync(FILE)) rmSync(FILE);
    out({ ok: true, removed: [vaultWhere(), FILE] });
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
