# Coastal Quest — Render + Supabase

เกม Unity WebGL พร้อมห้องเรียนภาษาไทย โหมดเดี่ยว ทีม และบอส ใช้ Vite/React บน Render Static Site และ Supabase Edge Functions/PostgreSQL/Auth/Realtime

## เริ่มพัฒนา

ใช้ Node.js 22.13 ขึ้นไป คัดลอก `.env.example` เป็น `.env.local` แล้วใส่ Supabase URL กับ publishable key ของโปรเจกต์ จากนั้นรัน `npm ci`, `npm run dev` ค่าที่ขึ้นต้น `VITE_` จะออกสู่เบราว์เซอร์ ห้ามใส่ service-role หรือ secret key

`npm run build` ตรวจ TypeScript และสร้าง `dist/` ส่วน `npm test` ตรวจ CSV, QR และความตรงกันของ Unity WASM

## หลังบ้านที่ติดตั้งแล้ว

โปรเจกต์ Supabase: Frostbound Classroom (`zjvzsfbtwxeazwnkxdbw`) ตามที่ผู้ใช้เลือก เพิ่มเฉพาะตาราง `cq_*` จำนวน 6 ตารางและ Edge Function `coastal-classroom` โดยไม่แก้ตาราง `frostbound_*` และไม่เปลี่ยน Auth settings ของโปรเจกต์เดิม

`supabase/sql/coastal-quest.sql` ตามด้วย `transactions.sql` คือโครงสร้างติดตั้งครั้งแรก ห้ามรันซ้ำกับโปรเจกต์ที่ติดตั้งแล้ว ระบบใช้ RLS แบบไม่อนุญาต client อ่านตารางโดยตรงและเพิกถอนสิทธิ์ anon/authenticated ทั้งหมด เข้าถึงข้อมูลผ่าน Edge Function ซึ่งตรวจ teacher JWT/owner หรือ opaque player token ที่เก็บเฉพาะ hash ในฐานข้อมูล

ฟังก์ชันนี้ตั้ง `verify_jwt=false` เพราะรองรับนักเรียนไม่มีบัญชี แต่ทุกคำสั่งที่ต้องมีสิทธิ์ตรวจ authentication เอง บัญชีครูยืนยันด้วย `auth.getUser(token)` และนักเรียนใช้ `x-cq-player` ห้ามนำ secret key ไปไว้ในหน้าเว็บ

การบันทึกคำตอบ ควบคุมห้อง และเข้าห้องล็อกแถวห้องใน transaction การตอบซ้ำพร้อมกันจึงรับรางวัลได้ครั้งเดียว และการตอบหลังหยุด/จบห้องถูกปฏิเสธ Realtime Broadcast ส่งเพียง `changed:true` และ ID ของข้อความ จากนั้น client อ่านสถานะใหม่ผ่าน API ที่ตรวจสิทธิ์ มี fallback ทุก 15 วินาที

## เผยแพร่บน Render ฟรี

1. Push โค้ดนี้เข้า GitHub repository ของเกม
2. สร้าง **Static Site** ใน Render เลือก repository/branch ของเกม
3. Build command: `npm ci --no-audit --no-fund && npm run build`
4. Publish directory: `dist`
5. Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (publishable เท่านั้น)
6. รอ deploy เป็น `live` และทดสอบ URL จริง ก่อนส่งให้นักเรียน

ลิงก์ห้องใช้ `/?room=123456` และหน้าครูใช้ `/?view=teacher` จึงเปิดตรงบน static hosting ได้โดยไม่ต้องตั้ง rewrite เพิ่ม `render.yaml` มี rewrite สำหรับรองรับ `/teacher` และ `/room/:pin` เพิ่มเติมหากใช้ Blueprint

## บัญชีครูก่อนใช้งานจริง

โปรเจกต์ Supabase เดิมเปิด email Auth แล้ว แต่ยังไม่ได้ทดสอบสมัครบัญชีจริง การส่งอีเมล หรือเข้าสู่ระบบด้วยผู้ใช้จริงจากโฮสต์ใหม่ ต้องตรวจ SMTP และเพิ่ม URL เว็บใหม่ใน Auth Redirect URLs โดยเก็บค่าของแอป Frostbound เดิมไว้ด้วย อีเมลเริ่มต้นของ Supabase ไม่รองรับส่งให้ผู้ใช้ทั่วไปโดยไม่มี custom SMTP อย่าปิดการยืนยันอีเมลเพื่อแก้ปัญหาการส่งอีเมล

## ผลทดสอบและขอบเขต

- Build และ TypeScript ผ่าน
- Core tests 3 กลุ่มผ่าน: CSV หลายบรรทัด/จุลภาค, decode QR อิสระ, SHA-256 ของ Unity WASM ตรงกับ build เดิม
- Hosted API 27 checks ผ่านกับ Supabase จริง รวมเข้าห้อง ไม่มีเฉลยรั่ว ส่งคำตอบซ้ำ 5 ครั้งให้รางวัลครั้งเดียว พลัง กระสุน โล่ และ Realtime
- SQL integration ผ่าน: เจ้าของข้อสอบ คะแนนทีม analytics หยุด/เล่นต่อ snapshot คำถาม เป้าหมายบอส และปิดการเข้าห้องที่จบแล้ว ลบ fixture ใน transaction เดียวกัน
- ไม่ได้ทดสอบ 60 เครื่องจริง, teacher signup/login/email delivery และ browser WebGL บน Render ใหม่ ยังต้องทดสอบหลังเผยแพร่
- ฉากต่อสู้แต่ละเครื่องเป็นฉากส่วนตัว แชร์คะแนน เวลา และพลังบอส ยังไม่ซิงก์ตำแหน่งผู้เล่น/PvP และยังไม่มี touch controls

Supabase และ Render ฟรีมีโควตาร่วมกับโปรเจกต์อื่นในบัญชี การอัปเดตถี่หรือใช้พร้อมกันหลายห้องอาจแตะโควตา ต้องดู usage จริง ไม่รับรองว่าใช้ฟรีได้ไม่จำกัด

เอกสาร: https://render.com/docs/static-sites · https://supabase.com/docs/guides/functions · https://supabase.com/docs/guides/auth/auth-smtp
