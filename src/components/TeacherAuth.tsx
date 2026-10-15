import { useState } from "react";
import { ArrowRight, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Email/password teacher accounts (replaces the old ChatGPT sign-in).
export function TeacherAuth() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [name, setName] = useState("");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + "/?view=teacher", data: { display_name: name.trim() } } });
        if (error) throw error;
        if (!data.session) setMessage("สมัครสำเร็จ กรุณายืนยันอีเมลจากกล่องจดหมายของคุณ แล้วกลับมาเข้าสู่ระบบ");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      const m = (err as Error).message;
      setError(/Email address not authorized|email_address_not_authorized/i.test(m) ? "ระบบยังส่งอีเมลยืนยันไปที่อยู่นี้ไม่ได้ กรุณาให้ผู้ดูแลตั้งค่าบริการอีเมลก่อนสมัคร" : /Invalid login/i.test(m) ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง" : /confirm/i.test(m) ? "กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ" : m);
    } finally { setBusy(false); }
  };
  return <section className="sign-in">
    <span className="mode-icon"><BookOpen size={32} /></span>
    <span className="overline">TEACHER SPACE</span>
    <h1>ภารกิจดี ๆ เริ่มจากคุณครู</h1>
    <p>{mode === "login" ? "เข้าสู่ระบบบัญชีครูด้วยอีเมล" : "สมัครบัญชีครูด้วยอีเมล"} เพื่อเก็บคลังข้อสอบ<br />เปิดห้องเรียน และดูผลของนักเรียนข้ามอุปกรณ์</p>
    <form className="auth-form" onSubmit={submit}>
      {mode === "signup" && <label>ชื่อที่แสดง<input value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder="เช่น ครูสมใจ" required /></label>}
      <label>อีเมล<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></label>
      <label>รหัสผ่าน<input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={6} autoComplete={mode === "login" ? "current-password" : "new-password"} required /></label>
      {error && <p role="alert" className="auth-error">{error}</p>}
      {message && <p role="status" className="auth-message">{message}</p>}
      <button className="btn primary full" disabled={busy}>{busy ? "กำลังดำเนินการ..." : mode === "login" ? "เข้าสู่ระบบ" : "สมัครบัญชีครู"}<ArrowRight size={18} /></button>
    </form>
    <button type="button" className="text-link" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); setMessage(""); }}>{mode === "login" ? "ยังไม่มีบัญชี? สมัครบัญชีครู" : "มีบัญชีแล้ว? เข้าสู่ระบบ"}</button>
    <small>ข้อสอบของแต่ละบัญชีแยกจากกัน นักเรียนไม่ต้องมีบัญชีครู</small>
  </section>;
}

