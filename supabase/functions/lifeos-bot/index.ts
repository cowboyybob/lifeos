// Life OS Telegram bot — Supabase Edge Function (free tier).
// Deploy with "Verify JWT" OFF. Needs one secret: TELEGRAM_BOT_TOKEN.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
// After deploy open:  <function-url>?setup=1   (sets the Telegram webhook)
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const SITE = "https://cowboyybob.github.io/lifeos/";

async function sha(s: string) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); }
async function tg(method: string, body: unknown) {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return r.json();
}
const send = (chat_id: number, text: string) => tg("sendMessage", { chat_id, text, parse_mode: "HTML", disable_web_page_preview: true });
const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pad = (n: number) => String(n).padStart(2, "0");
const toMin = (s: string) => { if (!s) return 0; const [a, b] = s.split(":").map(Number); return a * 60 + b; };
const fromMin = (m: number) => { m = ((Math.round(m) % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ":" + pad(m % 60); };

// local date of the user: tz = minutes east of UTC (Bishkek = 360)
function localNow(tz: number) { return new Date(Date.now() + tz * 60000); } // read with getUTC*
const dkey = (d: Date) => d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());

async function docs(uid: string, ids: string[]) {
  const { data } = await db.from("lifeos_docs").select("id,body").eq("user_id", uid).in("id", ids);
  const o: Record<string, any> = {}; (data ?? []).forEach((r: any) => o[r.id] = r.body); return o;
}
function classesFor(state: any, d: Date) {
  const t = state?.profile?.tt; if (!t || !t.on) return [];
  const dw = (d.getUTCDay() + 6) % 7;
  let wk = "num";
  if (t.alt) {
    const ref = new Date(t.ref + "T00:00:00Z"); const mon = (x: Date) => { const y = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate())); y.setUTCDate(y.getUTCDate() - ((y.getUTCDay() + 6) % 7)); return y; };
    const w = Math.round((mon(d).getTime() - mon(ref).getTime()) / 6048e5); wk = ((w % 2) + 2) % 2 === 0 ? "num" : "den";
  }
  const row = (t[wk] || {})[dw] || {};
  return Object.keys(row).filter(i => row[i] && String(row[i]).trim() && t.slots[i]).map(i => ({ id: "c" + i, t: String(row[i]).trim() + " (" + (+i + 1) + " пара)", s: toMin(t.slots[i].s), e: toMin(t.slots[i].e) }));
}
async function planText(uid: string, d: Date, title: string) {
  const k = dkey(d), o = await docs(uid, ["state", "day-" + k]); const st = o.state, day = o["day-" + k] || {};
  if (!st) return "Не нашёл твой план. Открой Life OS и войди по почте: " + SITE;
  const dirs: Record<string, string> = {}; (st.dirs || []).forEach((x: any) => dirs[x.id] = x.name);
  const ev = (day.blocks || []).map((b: any) => ({ t: b.t, s: toMin(b.s), e: toMin(b.e), done: b.done, dir: dirs[b.dir] })).concat(classesFor(st, d));
  ev.sort((a: any, b: any) => a.s - b.s);
  const pri = (day.priorities || []).filter((x: string) => x && x.trim());
  let txt = `<b>${title}</b>\n`;
  if (pri.length) txt += "\nГлавное:\n" + pri.map((x: string, i: number) => `${i + 1}. ${esc(x)}`).join("\n") + "\n";
  txt += ev.length ? "\n" + ev.map((x: any) => `${x.done ? "✅" : "▫️"} ${fromMin(x.s)}–${fromMin(x.e)}  ${esc(x.t)}${x.dir ? " · " + esc(x.dir) : ""}`).join("\n") : "\nБлоков пока нет. Добавь: /add 18:00-19:00 Английский";
  return txt + `\n\n<a href="${SITE}">Открыть Life OS</a>`;
}
const HELP = "Команды:\n/today — план на сегодня\n/tomorrow — на завтра\n/add 18:00-19:00 Текст — добавить блок\n/stop — отключить бота\n\nНапоминания приходят за 5–10 минут до блока и пары, а утром в час подъёма я присылаю план дня.";

async function onUpdate(u: any) {
  const m = u.message; if (!m || !m.text) return; const chat = m.chat.id, text = String(m.text).trim();
  if (text.startsWith("/start")) {
    const code = text.split(/\s+/)[1];
    if (!code) return send(chat, "Привет! Это бот Life OS. Чтобы связать его с твоим планом, открой " + SITE + " → Настройки → Telegram-бот → Подключить.");
    const { data } = await db.from("lifeos_docs").select("user_id,body").eq("id", "tglink").eq("body->>code", code).maybeSingle();
    if (!data || (data.body.exp && data.body.exp < Date.now())) return send(chat, "Код устарел. Нажми «Подключить» в настройках Life OS ещё раз.");
    await db.from("lifeos_tg").delete().eq("user_id", data.user_id);
    await db.from("lifeos_tg").upsert({ chat_id: chat, user_id: data.user_id, tz: Number(data.body.tz ?? 360) });
    await db.from("lifeos_docs").delete().eq("user_id", data.user_id).eq("id", "tglink");
    return send(chat, "Готово, бот подключён к твоему Life OS ✨\n\n" + HELP);
  }
  const { data: link } = await db.from("lifeos_tg").select("user_id,tz").eq("chat_id", chat).maybeSingle();
  if (!link) return send(chat, "Сначала подключи бота: " + SITE + " → Настройки → Telegram-бот.");
  const now = localNow(link.tz);
  if (text.startsWith("/today")) return send(chat, await planText(link.user_id, now, "Сегодня"));
  if (text.startsWith("/tomorrow")) return send(chat, await planText(link.user_id, new Date(now.getTime() + 864e5), "Завтра"));
  if (text.startsWith("/stop")) { await db.from("lifeos_tg").delete().eq("chat_id", chat); return send(chat, "Отключил. Вернуть можно в настройках Life OS."); }
  if (text.startsWith("/add")) {
    const mm = text.match(/^\/add\s+(\d{1,2}[:.]\d{2})\s*[-–—]\s*(\d{1,2}[:.]\d{2})\s+(.+)$/);
    if (!mm) return send(chat, "Формат: /add 18:00-19:00 Английский");
    const f = (x: string) => fromMin(toMin(x.replace(".", ":")));
    const s = f(mm[1]), e = f(mm[2]); if (toMin(e) <= toMin(s)) return send(chat, "Конец должен быть позже начала.");
    const k = dkey(now), o = await docs(link.user_id, ["state", "day-" + k]);
    const day = o["day-" + k] || { date: k, blocks: [], priorities: [], habits: {}, prayed: {}, review: null };
    day.blocks = day.blocks || [];
    day.blocks.push({ id: Math.random().toString(36).slice(2, 9), t: mm[3].trim(), s, e, dir: o.state?.dirs?.[0]?.id });
    await db.from("lifeos_docs").upsert({ user_id: link.user_id, id: "day-" + k, body: day, updated_at: new Date().toISOString() });
    return send(chat, `Добавил: ${s}–${e} ${esc(mm[3].trim())}`);
  }
  return send(chat, HELP);
}

async function cron() {
  const { data: links } = await db.from("lifeos_tg").select("chat_id,user_id,tz"); let n = 0;
  for (const l of links ?? []) {
    const now = localNow(l.tz), nm = now.getUTCHours() * 60 + now.getUTCMinutes(), k = dkey(now);
    const o = await docs(l.user_id, ["state", "day-" + k]); const st = o.state; if (!st) continue;
    const day = o["day-" + k] || {};
    const items: { key: string; text: string }[] = [];
    const wake = toMin(st.profile?.wake || "07:00");
    if (nm >= wake && nm - wake < 10) items.push({ key: "morning", text: await planText(l.user_id, now, "Доброе утро! План на сегодня") });
    const ev = (day.blocks || []).filter((b: any) => !b.done).map((b: any) => ({ id: b.id, t: b.t, s: toMin(b.s) })).concat(classesFor(st, now));
    for (const x of ev) { const d = x.s - nm; if (d >= 0 && d <= 10) items.push({ key: x.id, text: `⏰ Через ${d} мин: <b>${esc(x.t)}</b> (${fromMin(x.s)})` }); }
    for (const it of items) {
      const key = `${l.user_id}:${k}:${it.key}`;
      const { error } = await db.from("lifeos_tg_sent").insert({ key });
      if (error) continue; // already sent
      await send(l.chat_id, it.text); n++;
    }
  }
  await db.from("lifeos_tg_sent").delete().lt("at", new Date(Date.now() - 3 * 864e5).toISOString());
  return n;
}

// Official prayer times from muftiyat.kg (all Kyrgyzstan cities, today). Cached ~1h.
let ptCache: { at: number; data: any } | null = null;
async function officialTimes() {
  if (ptCache && Date.now() - ptCache.at < 3600e3) return ptCache.data;
  const html = await fetch("https://muftiyat.kg/", { headers: { "User-Agent": "LifeOS/1.0" } }).then(r => r.text());
  const rx = /'title': '([^']+)', 'prayertimes': \{[^}]*?'date': '([\d-]+)'[^}]*?'fajr': '([\d:]+)', 'sunrise': '([\d:]+)', 'dhuhr': '([\d:]+)', 'asr': '([\d:]+)', 'sunset': '([\d:]+)', 'maghrib': '([\d:]+)', 'isha': '([\d:]+)'/g;
  const cities: Record<string, any> = {}; let date = ""; let m;
  while ((m = rx.exec(html))) { date = m[2]; cities[m[1]] = { fajr: m[3], sunrise: m[4], dhuhr: m[5], asr: m[6], sunset: m[7], maghrib: m[8], isha: m[9] }; }
  const data = { source: "muftiyat.kg", date, cities };
  if (Object.keys(cities).length) ptCache = { at: Date.now(), data };
  return data;
}
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" };

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("prayer")) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    try { return Response.json(await officialTimes(), { headers: { ...CORS, "Cache-Control": "public, max-age=1800" } }); }
    catch (e) { return Response.json({ error: String(e) }, { status: 502, headers: CORS }); }
  }
  if (!TOKEN) return new Response("TELEGRAM_BOT_TOKEN secret is missing", { status: 500 });
  const secret = (await sha("lifeos:" + TOKEN)).slice(0, 48);
  if (url.searchParams.get("setup")) {
    const hook = Deno.env.get("SUPABASE_URL") + "/functions/v1/lifeos-bot";
    const r1 = await tg("setWebhook", { url: hook, secret_token: secret, allowed_updates: ["message"] });
    await tg("setMyCommands", { commands: [{ command: "today", description: "План на сегодня" }, { command: "tomorrow", description: "План на завтра" }, { command: "add", description: "Добавить блок: /add 18:00-19:00 Текст" }, { command: "stop", description: "Отключить бота" }] });
    return Response.json({ webhook: r1 });
  }
  if (url.searchParams.get("cron")) return Response.json({ sent: await cron() });
  if (req.method === "POST") {
    if (req.headers.get("x-telegram-bot-api-secret-token") !== secret) return new Response("forbidden", { status: 403 });
    try { await onUpdate(await req.json()); } catch (e) { console.error(e); }
    return new Response("ok");
  }
  return new Response("Life OS bot");
});
