// Server-only port of the original /api/classroom behaviour (Cloudflare D1 -> Lovable Cloud).
// All ownership, room-phase and answer checks happen here; the browser never sees answer keys before submitting.
import { z } from "npm:zod@3.25.76";
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
const secrets = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
const db = createClient(Deno.env.get("SUPABASE_URL")!, secrets.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {auth:{persistSession:false,autoRefreshToken:false}});
import { DEMO_QUESTIONS, type Quiz } from "./demo.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
const MAX_PLAYERS = 60;
const json = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });
class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
const fail = (status: number, message: string): never => { throw new ApiError(status, message); };
const check = <T>(res: { data: T; error: any }): T => { if (res.error) throw new Error(res.error.message); return res.data; };

type Teacher = { userId: string; name: string; email: string };
async function getTeacher(request: Request): Promise<Teacher | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  const u = data.user;
  const name = (u.user_metadata?.["display_name"] as string) || (u.email ?? "ครู").split("@")[0] || "ครู";
  return { userId: u.id, name, email: u.email ?? "" };
}
async function teacher(request: Request) { const u = await getTeacher(request); if (!u) fail(401, "กรุณาเข้าสู่ระบบบัญชีครูก่อน"); return u!; }
async function owned(request: Request, table: "banks" | "rooms", key: string) {
  const u = await teacher(request);
  if (!z.string().uuid().safeParse(key).success) fail(404, "ไม่พบข้อมูลหรือคุณไม่มีสิทธิ์เข้าถึง");
  const row = check(await db.from("cq_" + table).select("*").eq("id", key).eq("owner", u.userId).maybeSingle()) as Row | null;
  if (!row) fail(404, "ไม่พบข้อมูลหรือคุณไม่มีสิทธิ์เข้าถึง");
  return row!;
}
const pinSchema = z.string().regex(/^\d{6}$/);
const quizSchema = z.object({ prompt: z.string().trim().min(3).max(2000), options: z.array(z.string().trim().min(1).max(500)).length(4), correct: z.number().int().min(0).max(3), explanation: z.string().max(2000).default("") });
async function hash(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), b => b.toString(16).padStart(2, "0")).join(""); }
function cookie(request: Request, name: string) { return request.headers.get("cookie")?.split(";").map(s => s.trim()).find(s => s.startsWith(name + "="))?.slice(name.length + 1); }
async function member(request: Request, room: Row) {
  const token = request.headers.get("x-cq-player");
  if (!token) return null;
  return check(await db.from("cq_players").select("*").eq("room_id", room.id).eq("token_hash", await hash(token)).gte("created_at", Date.now()-12*60*60*1000).maybeSingle()) as Row | null;
}
function remaining(room: Row) { if (!room.started_at) return room.duration; return Math.max(0, Math.ceil(room.duration - ((room.paused_at ?? Date.now()) - room.started_at - room.paused_ms) / 1000)); }
function phase(room: Row, hits = 0) { if (room.status === "finished" || (room.mode === "boss" && hits >= room.boss_target) || (room.started_at && remaining(room) <= 0)) return "finished"; return room.status; }
async function lookup(pin: string) { const room = check(await db.from("cq_rooms").select("*").eq("pin", pin).maybeSingle()) as Row | null; if (!room) fail(404, "ไม่พบรหัสห้องนี้ ลองตรวจสอบกับคุณครูอีกครั้ง"); return room!; }
async function totals(room: Row) { return (check(await db.rpc("cq_room_totals", { _room: room.id })) as Row[]).map(p => ({ ...p, answered: Number(p.answered), correct: Number(p.correct), score: Number(p.score) })); }

async function roomState(request: Request, room: Row) {
  const user = await getTeacher(request), isHost = !!user && user.userId === room.owner, player = await member(request, room);
  if (!isHost && !player) fail(403, "กรุณาเข้าร่วมห้องด้วยชื่อเล่นก่อน");
  const roster = await totals(room), hits = roster.reduce((n, p) => n + p.correct, 0);
  const { count } = await db.from("cq_room_questions").select("id", { count: "exact", head: true }).eq("room_id", room.id);
  const status = phase(room, hits);
  let question: Row | null = null;
  if (player && status === "playing") {
    const q = (check(await db.rpc("cq_next_question", { _room: room.id, _player: player.id })) as Row[])[0];
    // Never send correct/explanation to the student before they submit.
    if (q) question = { id: q.id, prompt: q.prompt, options: q.options, position: q.qposition };
  }
  const teams = Array.from({ length: room.team_count }, (_, i) => ({ team: i + 1, score: roster.filter(p => p.team === i + 1).reduce((n, p) => n + p.score, 0), members: roster.filter(p => p.team === i + 1).length }));
  const analytics = isHost ? (check(await db.rpc("cq_room_analytics", { _room: room.id })) as Row[]).map(a => ({ position: a.qposition, prompt: a.prompt, answered: Number(a.answered), correct: Number(a.correct) })) : undefined;
  return { room: { id: room.id, pin: room.pin, title: room.title, subject: room.subject, mode: room.mode, status, teamCount: room.team_count, questionCount: count ?? 0, remaining: remaining(room), bossTarget: room.boss_target, bossHits: hits }, isHost, player: player ? roster.find(p => p.id === player.id) ?? null : null, roster, teams, analytics, question };
}

function randomPin() { return String(100000 + crypto.getRandomValues(new Uint32Array(1))[0]! % 900000); }
async function addRoom(owner: string | null, title: string, subject: string, mode: string, teamCount: number, bossTarget: number, duration: number, quizzes: Quiz[], practice = false) {
  const now = Date.now();
  for (let n = 0; n < 12; n++) {
    const pin = randomPin();
    const { error } = await db.rpc("cq_create_room", { _owner: owner as string, _practice: practice, _pin: pin, _title: title, _subject: subject, _mode: mode, _status: practice ? "playing" : "lobby", _teams: teamCount, _target: bossTarget, _duration: duration, _started: practice ? now : (null as unknown as number), _questions: quizzes.map(q => ({ prompt: q.prompt, options: q.options, correct: q.correct, explanation: q.explanation })), _now: now });
    if (!error) return lookup(pin);
    if (!String(error.message).includes("duplicate")) throw new Error(error.message);
  }
  return fail(503, "สร้างรหัสห้องไม่สำเร็จ กรุณาลองใหม่");
}

async function join(request: Request, room: Row, name: string, selectedTeam?: number) {
  if (phase(room) === "finished") fail(409, "ห้องนี้จบกิจกรรมแล้ว");
  const existing = await member(request, room);
  if (existing) return json({ pin: room.pin });
  const roster = await totals(room);
  if (roster.length >= MAX_PLAYERS) fail(409, `ห้องเต็มแล้ว (สูงสุด ${MAX_PLAYERS} คน)`);
  if (roster.some(p => p.name === name)) fail(409, "ชื่อนี้มีผู้ใช้แล้ว กรุณาเพิ่มเลขท้ายชื่อ");
  const team = room.mode === "teams" ? Math.max(1, Math.min(room.team_count, selectedTeam ?? (roster.length % room.team_count + 1))) : 0;
  const token = crypto.randomUUID() + crypto.randomUUID();
  const { error } = await db.rpc("cq_join_room", { _room: room.id, _name: name, _team: team, _token_hash: await hash(token), _now: Date.now() });
  if (error) { if (error.message.includes("ROOM_CLOSED")) fail(409, "ห้องนี้จบกิจกรรมแล้ว"); if (error.message.includes("ROOM_FULL")) fail(409, "ห้องเต็มแล้ว"); if (error.message.includes("NAME_TAKEN") || error.message.includes("duplicate")) fail(409, "ชื่อนี้มีผู้ใช้แล้ว กรุณาเพิ่มเลขท้ายชื่อ"); throw new Error(error.message); }
  return json({ pin: room.pin, token });
}

async function saveBank(user: Teacher, raw: Row) {
  const input = z.object({ id: z.string().uuid().optional(), title: z.string().trim().min(2).max(120), subject: z.string().trim().min(1).max(80), grade: z.string().trim().max(80).default(""), questions: z.array(quizSchema).min(1).max(100) }).parse(raw);
  const { data, error } = await db.rpc("cq_save_bank", { _owner: user.userId, _id: (input.id ?? null) as unknown as string, _title: input.title, _subject: input.subject, _grade: input.grade, _questions: input.questions, _now: Date.now() });
  if (error) { if (error.message.includes("NOT_OWNER")) fail(404, "ไม่พบข้อมูลหรือคุณไม่มีสิทธิ์เข้าถึง"); throw new Error(error.message); }
  return json({ id: data });
}

export async function handleGet(request: Request) {
  try {
    const url = new URL(request.url), action = url.searchParams.get("action");
    if (action === "me") { const u = await getTeacher(request); return json({ user: u ? { id: u.userId, name: u.name, email: u.email } : null }); }
    if (action === "banks") {
      const u = await teacher(request);
      const banks = check(await db.from("cq_banks").select("*, questions:cq_questions(count)").eq("owner", u.userId).order("created_at", { ascending: false })) as Row[];
      return json({ banks: banks.map(({ questions, ...b }) => ({ ...b, count: questions?.[0]?.count ?? 0 })) });
    }
    if (action === "bank") {
      const b = await owned(request, "banks", url.searchParams.get("id") ?? "");
      const qs = check(await db.from("cq_questions").select("id,position,prompt,options,correct,explanation").eq("bank_id", b.id).order("position")) as Row[];
      return json({ bank: b, questions: qs });
    }
    if (action === "rooms") {
      const u = await teacher(request);
      const rooms = check(await db.from("cq_rooms").select("*, players:cq_players(count)").eq("owner", u.userId).order("created_at", { ascending: false }).limit(50)) as Row[];
      return json({ rooms: rooms.map(({ players, ...r }) => ({ ...r, status: phase(r), participants: players?.[0]?.count ?? 0 })) });
    }
    if (action === "lookup") { const r = await lookup(pinSchema.parse(url.searchParams.get("pin"))); return json({ room: { pin: r.pin, title: r.title, mode: r.mode, teamCount: r.team_count, status: phase(r) } }); }
    if (action === "state") return json(await roomState(request, await lookup(pinSchema.parse(url.searchParams.get("pin")))));
    if (action === "export") {
      const r = await owned(request, "rooms", url.searchParams.get("id") ?? ""), roster = await totals(r);
      const cell = (v: any) => '"' + String(v ?? "").replace(/^[=+@-]/, "'$&").replaceAll('"', '""') + '"';
      return new Response("\uFEFF" + [["ชื่อเล่น", "ทีม", "ตอบแล้ว", "ตอบถูก", "คะแนน"], ...roster.map(p => [p.name, p.team || "-", p.answered, p.correct, p.score])].map(row => row.map(cell).join(",")).join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="classquest-${r.pin}.csv"`, "Cache-Control": "no-store" } });
    }
    return json({ error: "ไม่พบคำสั่ง" }, 404);
  } catch (e) { return error(e); }
}

export async function handlePost(request: Request) {
  try {
    if (!request.headers.get("content-type")?.includes("application/json")) fail(415, "ต้องส่งข้อมูล JSON");
    const text = await request.text(); if (text.length > 300000) fail(413, "ข้อมูลใหญ่เกินไป");
    const body = JSON.parse(text), action = body.action;
    if (action === "bank.save") return await saveBank(await teacher(request), body);
    if (action === "bank.demo") return await saveBank(await teacher(request), { title: "ภารกิจความรู้รอบเกาะ", subject: "คณิตศาสตร์และวิทยาศาสตร์", grade: "ตัวอย่างทั่วไป · ครูแก้ไขได้", questions: DEMO_QUESTIONS });
    if (action === "bank.delete") { const b = await owned(request, "banks", String(body.id)); check(await db.from("cq_banks").delete().eq("id", b.id)); return json({ ok: true }); }
    if (action === "room.create") {
      const u = await teacher(request), b = await owned(request, "banks", z.string().parse(body.bankId));
      const qs = check(await db.from("cq_questions").select("prompt,options,correct,explanation").eq("bank_id", b.id).order("position")) as Row[];
      if (!qs.length) fail(400, "ชุดนี้ยังไม่มีคำถาม");
      const mode = z.enum(["solo", "teams", "boss"]).parse(body.mode), teams = z.number().int().min(2).max(6).parse(body.teamCount ?? 4), target = z.number().int().min(1).max(2000).parse(body.bossTarget ?? 12), duration = z.number().int().min(60).max(7200).parse(body.duration ?? 900);
      const room = await addRoom(u.userId, b.title, b.subject, mode, teams, target, duration, qs as Quiz[]);
      return json({ pin: room.pin, id: room.id });
    }
    if (action === "room.control") {
      const r = await owned(request, "rooms", z.string().parse(body.id)), s = z.enum(["playing", "paused", "finished"]).parse(body.status);
      const { error: controlError } = await db.rpc("cq_control_room", { _room: r.id, _owner: r.owner, _status: s, _now: Date.now() });
      if (controlError) { if (/ROOM_CLOSED|INVALID_TRANSITION/.test(controlError.message)) fail(409,"ไม่สามารถเปลี่ยนสถานะห้องในขณะนี้ได้"); throw controlError; }
      return json({ ok: true });
    }
    if (action === "join") return await join(request, await lookup(pinSchema.parse(body.pin)), z.string().trim().min(1).max(24).parse(body.name), body.team === undefined ? undefined : z.number().int().min(1).max(6).parse(body.team));
    if (action === "practice") { const name = z.string().trim().min(1).max(24).parse(body.name ?? "นักสำรวจ"); const r = await addRoom(null, "ฝึกซ้อม: ภารกิจความรู้รอบเกาะ", "ความรู้ทั่วไป", "solo", 2, 12, 1800, DEMO_QUESTIONS, true); return await join(request, r, name); }
    if (action === "answer") {
      const room = await lookup(pinSchema.parse(body.pin)), player = await member(request, room);
      if (!player) fail(403, "กรุณาเข้าร่วมห้องก่อน");
      const questionId = z.string().uuid().parse(body.questionId), choice = z.number().int().min(0).max(3).parse(body.choice);
      const { data, error: answerError } = await db.rpc("cq_submit_answer", { _room: room.id, _player: player!.id, _question: questionId, _choice: choice, _now: Date.now() });
      if (answerError) { if (/ROOM_CLOSED|QUESTION_ALREADY_ANSWERED|QUESTION_NOT_CURRENT/.test(answerError.message)) fail(409, "คำถามนี้ตอบแล้ว หรือห้องยังไม่เริ่ม หยุดชั่วคราว หรือจบแล้ว"); if (/NOT_MEMBER/.test(answerError.message)) fail(403,"กรุณาเข้าร่วมห้องก่อน"); throw answerError; }
      return json(data);
    }
    return json({ error: "ไม่พบคำสั่ง" }, 404);
  } catch (e) { return error(e); }
}

function error(e: unknown) {
  if (e instanceof ApiError) return json({ error: e.message }, e.status);
  if (e instanceof z.ZodError) return json({ error: "ข้อมูลไม่ถูกต้อง กรุณาตรวจช่องที่กรอก", details: e.issues.map(i => i.path.join(".")) }, 400);
  if (e instanceof SyntaxError) return json({ error: "รูปแบบ JSON ไม่ถูกต้อง" }, 400);
  console.error("ClassQuest API", e instanceof Error ? e.message : "unknown");
  return json({ error: "ระบบไม่สามารถดำเนินการได้ในขณะนี้" }, 500);
}


// This public endpoint validates teacher JWTs and opaque student membership tokens itself.
// No cookie credentials are accepted, so cross-origin browser calls use explicit credentials.
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cq-player", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Max-Age": "86400" };
Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response(null,{status:204,headers:cors});
  const response = request.method === "GET" ? await handleGet(request) : request.method === "POST" ? await handlePost(request) : json({error:"Method not allowed"},405);
  const headers = new Headers(response.headers); for (const [key,value] of Object.entries(cors)) headers.set(key,value);
  return new Response(response.body,{status:response.status,headers});
});
