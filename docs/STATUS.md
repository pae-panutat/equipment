# equiplog (CMU Asset & Maintenance) — สถานะงาน

อัปเดตล่าสุด: 10 พ.ย. 2026 (โค้ดล่าสุดบน GitHub: `edb546c`)

## 1. ทำอะไรเสร็จแล้ว

- โครงระบบ: Next.js 16 (หน้าเว็บ `src/`) + Express (API `server/`, ที่ `/api/v1`) รันใน process เดียวผ่าน `server.js`
- ฐานข้อมูล: Drizzle ORM + mysql2, schema ที่ `db/schema.ts`, migrations ที่ `db/migrations/` (รันอัตโนมัติตอน server เริ่ม)
- ตาราง: ส่วนงาน, สถานที่, ประเภทอุปกรณ์, อุปกรณ์, แผนบำรุงรักษา, ใบงาน (+ `app_meta`)
- หน้าจอ: Dashboard แบบ Bento, ทะเบียนอุปกรณ์ (ค้นหา/กรอง/จัดเรียง/แบ่งหน้าที่ฝั่ง server)
- ธีมมืด (ค่าเริ่มต้น) และสว่าง, ฟอนต์ LINE Seed Sans TH ทั้งเว็บ
- ข้อมูลสมมติสำหรับพัฒนา: `npm run db:seed` (20 อุปกรณ์, 81 ใบงาน) ไม่รันบน production
- push เข้า git และ GitHub Actions deploy ขึ้นโฮสต์สำเร็จแล้ว (ไฟล์ขึ้นถึง `apps/equiplog/`)
- **ระบบ login (เขียนและทดสอบในเครื่องแล้ว ยังไม่ได้ push)**: ดูหัวข้อ 3

## 1.4 บทบาทและหน้าผู้ใช้งาน (ล่าสุด)

- บทบาทมี 3 อย่าง เรียงลำดับ: ผู้ดูแลระบบ (super_admin) → ช่างเทคนิค (technician) → ผู้ชมข้อมูล (viewer) — **ลบบทบาท "ผู้ดูแลส่วนงาน" (unit_admin) แล้ว** ทั้งในโค้ดและฐานข้อมูล (migration `0004` ย้ายผู้ที่ยังถือบทบาทนี้ไปเป็นผู้ชมข้อมูลก่อนลบค่าออกจาก enum)
- หน้า `/users`: เรียงผู้ดูแลระบบไว้บนสุดเสมอ แล้วตามด้วยช่างเทคนิค ผู้ชมข้อมูล (ภายในกลุ่มเรียงตามชื่อ); ปุ่ม "เพิ่มผู้ใช้" เปิด popup (ฉากหลังเบลอ/มืด) แทนกรอบฟอร์มเดิม; ปุ่ม "ตั้งรหัสผ่านใหม่" เปิด popup ที่ซ่อนรหัสเป็นจุด มีปุ่มรูปดวงตาเพื่อดู และมีช่องพิมพ์ซ้ำกันพิมพ์ผิด (`src/components/ui/password-input.tsx`)
- เอาช่อง "ผู้ขาย" และ "ราคา" ออกจากฟอร์มแก้ไข หน้ารายละเอียด และ API แล้ว (คอลัมน์ `vendor`, `price` ใน `assets` ยังอยู่ในฐานข้อมูล แต่ไม่ได้ใช้งาน)

### ทดสอบสแกน QR ด้วยมือถือตอน dev

1. มือถือกับคอมพิวเตอร์ต้องอยู่ Wi-Fi เดียวกัน (ถ้าเป็นเครือข่ายที่แยกอุปกรณ์ออกจากกัน เช่นบางแห่งในมหาวิทยาลัย จะไม่ผ่าน)
2. ดู IPv4 ของ Wi-Fi ด้วย `ipconfig` แล้วใส่ใน `.env.local`: `SITE_URL=http://<IP ของเครื่อง>:3000`
3. รีสตาร์ท `npm run dev` (ต้องรีสตาร์ทเพราะแก้ `next.config.mjs` เพิ่ม `allowedDevOrigins` สำหรับ IP ในวง LAN แล้ว)
4. อนุญาต Node.js ผ่าน Windows Firewall (เครือข่าย Private) ถ้า Windows ถาม
5. QR ที่บันทึกไว้ก่อนหน้า (เป็น localhost) ใช้ไม่ได้ ต้องเปิดดู/บันทึกใหม่หลังตั้ง `SITE_URL`

## 1.3 แก้ไขอุปกรณ์จากตารางทะเบียน (ทำและทดสอบในเครื่องแล้ว ยังไม่ push)

- ดับเบิลคลิกที่แถวในตาราง (หรือปุ่มดินสอท้ายแถว / กด Enter ที่แถว) → popup กลางจอ ฉากหลังเบลอและมืด (`src/components/ui/modal.tsx`, `src/components/assets/asset-edit-dialog.tsx`)
- แก้ได้ทุกช่องยกเว้น **รหัส** (ล็อกทั้งหน้าจอและ API: ส่ง `code` มาจะถูกปฏิเสธ 400)
- กด "ตรวจสอบและบันทึก" → หน้ายืนยันแสดงค่าเดิม → ค่าใหม่ → ต้องกด "ยืนยันและบันทึก" ถึงจะเขียนฐานข้อมูล (ก่อนยืนยัน DB ไม่เปลี่ยน; "กลับไปแก้ไข" เก็บค่าที่แก้ไว้)
- สิทธิ์: Super Admin และช่างเทคนิคเท่านั้น (Viewer แก้ไม่ได้ ไม่เห็นปุ่ม และ API ตอบ 403); ช่างที่เข้าด้วย CMU แก้ได้เฉพาะอุปกรณ์ในส่วนงานตัวเอง และย้ายอุปกรณ์ไปส่วนงานอื่นที่มองไม่เห็นไม่ได้
- กันแก้ทับกัน: API เทียบ "เวอร์ชันจากเนื้อหา" (แฮชของฟิลด์ที่แก้ไขได้) ภายใน transaction ถ้ามีคนบันทึกไปก่อนจะตอบ 409 และให้ปิดแล้วโหลดใหม่
- Esc ปิด popup ได้เมื่อยังไม่ได้แก้อะไร ถ้ามีการแก้ค้างอยู่ต้องกด "ยกเลิก" เอง; คลิกฉากหลังไม่ปิด
- ยังไม่มี: ประวัติการแก้ไข (audit log) ว่าใครแก้อะไรเมื่อไร, การเพิ่มอุปกรณ์ใหม่, การสร้างประเภทอุปกรณ์/สถานที่จาก UI

## 1.2 QR Code ของอุปกรณ์ (ทำและทดสอบในเครื่องแล้ว ยังไม่ push)

- อุปกรณ์ทุกชิ้นมี `qr_token` สุ่ม 128 บิตของตัวเอง (คอลัมน์ใหม่ใน `assets`, migration `0003`); ระบบเติมให้เองตอน server เริ่ม (`ensureQrTokens` ใน `server/qr.ts`) จึงครอบคลุมอุปกรณ์เดิมและที่เพิ่มใหม่ทุกทาง
- QR เก็บ URL `<SITE_URL>/q/<token>` (ภาพ SVG ขาว-ดำเสมอ สร้างโดยไลบรารี `qrcode`) ดูได้ 2 ที่: (1) คอลัมน์ "QR Code" ท้ายตารางทะเบียนอุปกรณ์ — ภาพเล็ก เอาเมาส์ชี้ (หรือแตะ/โฟกัสด้วยคีย์บอร์ด) แล้วขยายใหญ่ พร้อมปุ่ม "บันทึก PNG" (มีรหัสและชื่ออุปกรณ์ใต้ QR) และ "SVG" ปิดด้วยเมาส์ออก/Esc/แตะที่อื่น (`src/components/assets/qr-cell.tsx`); (2) หน้ารายละเอียด `/assets/<id>` (ปุ่ม "พิมพ์ป้าย QR" ซ่อนเมนูตอนพิมพ์) — ไม่มีเมนู QR แยก (ลบแล้วตามที่สั่ง)
- สแกน → `/q/<token>` → **ต้อง login ก่อนเสมอ** (ยังไม่ login ถูกส่งไป `/login?next=...` แล้วกลับมาที่อุปกรณ์หลัง login ทั้งแบบ Username/Password และ CMU) → API ตรวจสิทธิ์ตามกฎเดียวกับข้อ 1.1: Super Admin และช่างเทคนิค (Username/Password) เห็นทุกส่วนงาน; คนที่ login ด้วย CMU เห็นเฉพาะอุปกรณ์ของส่วนงานตัวเอง (นอกส่วนงาน = 403 "อุปกรณ์นี้อยู่นอกส่วนงานของคุณ"; ไม่มีอุปกรณ์ = 404)
- สิทธิ์เดียวกันใช้กับ `GET /assets/:id` และภาพ QR (`/assets/:id/qr.svg`) ไม่ใช่แค่ตอนสแกน
- ป้องกัน open redirect: `next` รับเฉพาะ path ในเว็บเดียวกัน (`safeNextPath` ใน `shared/index.ts`)
- **QR ฝัง URL ตาม `SITE_URL` ตอนที่ภาพถูกสร้าง**: ในเครื่องเป็น `http://localhost:3000` ซึ่งสแกนด้วยมือถือไม่ได้ ก่อนพิมพ์ป้ายจริงต้องตั้ง `SITE_URL=https://equiplog.ddns.net` (หรือ IP ของเครื่องในวง LAN ถ้าจะลองสแกนด้วยมือถือตอน dev)
- **เมื่อจะ push ขึ้นโฮสต์**: มี dependency ใหม่ `qrcode` → ใส่ `[skip restart]` ใน commit, รอ Actions เขียว, กด **Run NPM Install** แล้วค่อย Restart เอง (ดูหัวข้อ 7)
- ยังไม่ทำ: พิมพ์ป้าย QR หลายชิ้นพร้อมกัน, หน้าแก้ไขอุปกรณ์, การเทียบรหัส CMU กับคณะแบบอัตโนมัติ (ตอนนี้จับคู่จากชื่อคณะที่ CMU ส่งมา)

## 1.1 ระบบ login และสิทธิ์ (ยังไม่ push)

- login 2 แบบในหน้า `/login`: CMU Account (OAuth, เฉพาะ `@cmu.ac.th`) และ Username/Password พร้อม checkbox "จดจำฉัน" (ติ๊ก = อยู่ได้ **1 ปี** (`REMEMBER_DAYS = 365` ใน `shared/index.ts`; Chrome จำกัด cookie ไม่เกิน 400 วัน จึงตั้งเกินนี้ไม่ได้), ไม่ติ๊ก = หมดเมื่อปิดเบราว์เซอร์/สูงสุด 12 ชม.) session เก็บใน DB จึงรอดการรีสตาร์ท/deploy และใช้ได้ทุกอุปกรณ์/เบราว์เซอร์ (แต่ละเครื่องมี session ของตัวเอง) ถ้าเซิร์ฟเวอร์ตอบ error ชั่วคราวตอนเปิดเว็บ หน้าเว็บจะลองใหม่และขึ้นปุ่ม "ลองอีกครั้ง" แทนการเด้งไปหน้า login
  - ข้อจำกัดที่ควบคุมไม่ได้: ผู้ใช้ล้าง cookie/ข้อมูลเว็บ, โหมดไม่ระบุตัวตน, หรือเปิดลิงก์ QR ในเบราว์เซอร์ในแอป (เช่น LINE) ซึ่งแยก cookie จากเบราว์เซอร์หลัก; เปลี่ยนรหัสผ่านหรือปิดใช้งานผู้ใช้จะเตะ session ทุกเครื่องทันที
- ตาราง `users`, `sessions` (migration `0001`); รหัสผ่านเก็บแบบ scrypt; session เก็บ hash ของ token ใน DB; cookie `httpOnly` + `SameSite=Lax` + `Secure` บน production; ตรวจ Origin กัน CSRF; ล็อก 15 นาทีเมื่อผิด 5 ครั้ง (เก็บในหน่วยความจำ)
- ขอบเขตข้อมูล (ตัดสินจากบทบาท + วิธี login ของ session นั้น): Super Admin เห็นทุกส่วนงาน; **ช่างเทคนิคที่ login ด้วย Username/Password เห็นทุกส่วนงาน ไม่ต้องกำหนดส่วนงาน**; Viewer เห็นเฉพาะส่วนงานของตัวเอง (รวมส่วนงานย่อย); **ทุกคนที่ login ด้วย CMU (ยกเว้น Super Admin) เห็นเฉพาะส่วนงานของตัวเองเสมอ** ผู้ใช้ที่ไม่มีส่วนงานจะไม่เห็นข้อมูล ตอนนี้ดูได้อย่างเดียว สิทธิ์เขียน/แก้ไขจะมาตอนทำฟีเจอร์แก้ข้อมูล
- ตอนนี้ตั้งใจมีบัญชีช่างเทคนิค Username/Password แค่ 1 บัญชี (เพิ่มที่ `/users`) ระบบยังไม่บังคับจำนวน
- ผู้ใช้ที่เข้าด้วย CMU ครั้งแรกจะเป็น Viewer และระบบเลือกส่วนงานให้จากชื่อคณะที่ CMU ส่งมา (ต้องตรงชื่อ/รหัสส่วนงานเป๊ะ) ถ้าไม่ตรงจะไม่เห็นข้อมูลจน Super Admin กำหนดที่ `/users` ชื่อฟิลด์ตั้งทับได้ด้วย `CMU_OAUTH_ORG_FIELDS`
- ทดสอบ flow CMU กับเซิร์ฟเวอร์จำลองในเครื่องแล้ว (state ผิด, อีเมลนอก @cmu.ac.th, คณะตรง, คณะไม่ตรง)
- API ข้อมูลทุกตัวต้อง login แล้ว (เอา `ALLOW_DEMO_DATA` ออกแล้ว)
- บัญชีทดสอบในเครื่อง (`npm run db:seed`) รหัสผ่านทุกบัญชี `dev-password-1234` (เฉพาะ local): `dev-admin` (Super Admin) และ `dev-tech` (ช่างเทคนิค เห็นทุกส่วนงาน) เท่านั้น
- **CMU OAuth ยังไม่ได้ทดสอบกับของจริง**: ต้องขึ้นทะเบียนแอปกับ CMU เพื่อขอ client id/secret และตรวจ URL ที่ค่าเริ่มต้นใน `server/config.ts` (เขียนจากความจำ ยังไม่ได้ยืนยัน) ทุกค่าตั้งทับได้ด้วย env `CMU_OAUTH_*` (ดู `.env.example`) Redirect URI ที่ต้องลงทะเบียน: `https://equiplog.ddns.net/api/v1/auth/cmu/callback`

## 2. Deploy ขึ้นโฮสต์ — เสร็จแล้ว (10 พ.ย. 2026)

- เว็บบนโฮสต์เป็นเวอร์ชันใหม่ และ Restart แล้ว
- `https://equiplog.ddns.net/api/v1/health` ได้ `"ok":true,"db":"up"` และ `dbVersion` `10.11.19-MariaDB`
- phpMyAdmin ฐานข้อมูล `equiplog_cmu` มี 8 ตาราง (ว่าง): `__drizzle_migrations`, `app_meta`, `asset_types`, `assets`, `locations`, `maintenance_plans`, `organization_units`, `work_orders`
- ยังค้าง: ลบไฟล์เก่าใน `public_html/` (ดูหัวข้อ 4)

ถ้าเว็บขึ้น "Web application could not be started": กรอก *Passenger log file* เป็น `/home/equiplog/logs/passenger.log` → SAVE → Restart แล้วส่ง log ให้ผู้ช่วยอ่าน (อย่าให้มี password ติดมา)

## 3. สิ่งที่ควรเห็นบนโฮสต์ (ตั้งใจให้เป็นเช่นนั้น)

- (เวอร์ชันที่ deploy อยู่ตอนนี้) Dashboard และทะเบียนอุปกรณ์ขึ้น "ยังไม่เปิดใช้งาน: ต้องมีระบบเข้าสู่ระบบ" เพราะ API ข้อมูลถูกปิดบน production
- ฐานข้อมูลบนโฮสต์มีแค่โครงตาราง ไม่มีข้อมูล (ข้อมูลสมมติอยู่เฉพาะในเครื่อง `equiplog_cmu_dev`)

### ก่อน push โค้ด login ขึ้นโฮสต์ (ทำตามลำดับ)

1. DirectAdmin → Node.js app → Environment variables เพิ่ม
   - `SITE_URL` = `https://equiplog.ddns.net`
   - ผู้ดูแลคนแรก เลือกอย่างใดอย่างหนึ่ง: `BOOTSTRAP_ADMIN_CMU_EMAILS` = อีเมล @cmu.ac.th ของคุณ (ใช้ได้เมื่อ CMU OAuth พร้อม) หรือ `BOOTSTRAP_ADMIN_USERNAME` + `BOOTSTRAP_ADMIN_PASSWORD` (อย่างน้อย 10 ตัวอักษร พิมพ์เองในช่องนี้ ห้ามส่งในแชท)
   - เมื่อได้จาก CMU: `CMU_OAUTH_CLIENT_ID`, `CMU_OAUTH_CLIENT_SECRET`
2. push → รอ Actions เขียว (migration `0001` และบัญชีผู้ดูแลคนแรกถูกสร้างตอน server เริ่ม)
3. login ด้วยบัญชีผู้ดูแล แล้ว **ลบ `BOOTSTRAP_ADMIN_PASSWORD` ออกจาก Environment variables**
4. ที่ `/users` สร้างบัญชี/กำหนดส่วนงาน (ฐานข้อมูลบนโฮสต์ยังไม่มีส่วนงานเลย ต้องมีเครื่องมือเพิ่ม/นำเข้าส่วนงานในชิ้นถัดไป)

## 4. ลบไฟล์เก่าบนโฮสต์ (ทำเองใน File Manager หลังเว็บใหม่ทำงานแล้ว)

- `domains/equiplog.ddns.net/public_html/` ลบเว็บเดิม: `index.html`, `400/401/403/404/500.shtml`, `logo.png`, `.ftp-deploy-sync-state.json`
  - **ห้ามลบ `.htaccess`** (Node.js Selector ใช้ตั้งค่า Passenger)
- `apps/equiplog/` ไม่ต้องลบอะไร (ระบบ deploy ลบไฟล์เก่าเอง) อย่าลบ `.ftp-deploy-sync-state.json`, `node_modules`, `tmp`

## 5. ตัดสินใจ/ทำต่อ (ตามแผนใน prompt)

- ชิ้นถัดไป: จัดการส่วนงาน/สถานที่จาก UI (บนโฮสต์ยังไม่มีข้อมูลเลย), แยกสิทธิ์เขียนของแต่ละบทบาทเพิ่มเติม, บทบาท Public (QR)
- หน้ารายละเอียดอุปกรณ์, เพิ่ม/แก้ไขอุปกรณ์, อัปโหลดรูป, QR Code (`/q/<token>`), พิมพ์ QR
- งานบำรุงรักษา: แผน → ใบงาน → บันทึกผล (ปิดงานใน transaction), recurring plans
- ประเภทอุปกรณ์/custom fields จาก UI, ย้าย/โอนอุปกรณ์, audit log
- ยังไม่มี: ERD เอกสาร, README ระบุเวอร์ชัน, API doc (OpenAPI), automated tests, DEPLOYMENT.md
- ไฟล์ `src/components/ui/analytics-bento.tsx` เป็นต้นแบบอ้างอิงที่ยังไม่มีโค้ดใช้ (เก็บไว้ตามที่ขอ ลบได้ถ้าไม่ต้องการ)

## 6. พัฒนาในเครื่อง

```
cd C:\Users\torya\Documents\equipment
npm run dev          # เปิดเว็บ 3000 + API 4000 (ต้องเปิด MySQL ใน XAMPP ก่อน)
```

- เปิด http://localhost:3000 (API: http://localhost:3000/api/v1/health)
- ปิดด้วย Ctrl+C ใน terminal นั้น (ถ้าค้าง: `! taskkill //F //IM node.exe` ใน Git Bash)
- ฐานข้อมูล dev: `equiplog_cmu_dev` ใน XAMPP (MariaDB 10.4), ใช้ user `root` ไม่มี password ค่าอยู่ใน `.env.local` (Git ไม่เก็บ)
- สร้างข้อมูลสมมติใหม่: `npm run db:seed:reset` | แก้ schema: แก้ `db/schema.ts` → `npm run db:generate`
- เครื่องนี้บล็อกไฟล์ native ของ Next จึงใช้ `--webpack` อัตโนมัติใน `npm run dev` (ถ้า build เอง: `npx next build --webpack`)

## 7. วิธี deploy

- push เข้า `main` → GitHub Actions: `npm ci` → typecheck → build → อัปโหลด FTP → เรียก `/api/v1/internal/restart` (ใช้ secret `RESTART_TOKEN`, `SITE_URL`) ใช้เวลาประมาณ 5 นาที
- เมื่อแก้ dependencies ใน `package.json`: ใส่ `[skip restart]` ใน commit message → รอ Actions เขียว → กด Run NPM Install → กด Restart เอง
- ฐานข้อมูลบนโฮสต์: migration รันเองตอน server เริ่ม (ลำดับที่ปลอดภัยคือ deploy โค้ดที่มี migration ใหม่ก่อน แล้ว restart)

## 8. ข้อควรระวัง

- Local (MariaDB 10.4) ต่างจากโฮสต์ (10.11): ใช้ `datetime` สำหรับเวลาที่ว่างได้ (ไม่ใช้ `timestamp`) เพื่อไม่ให้ค่าเริ่มต้นเพี้ยน และเขียน SQL ให้ใช้ได้ทั้งสองรุ่น; ควรอัปเดต XAMPP ให้ใกล้เคียงโฮสต์ (backup `C:\xampp\mysql\data` ก่อน เพราะมีฐานข้อมูลอื่น)
- ตาราง `mysql.db` ของ XAMPP เสียหาย (สร้าง user ใหม่พร้อมสิทธิ์ไม่ได้) จึงใช้ `root` ในเครื่อง
- Apache ของโฮสต์ cache ผลลัพธ์ที่มี `s-maxage` จึงตั้งหน้าเป็น dynamic + `no-store` (อย่าเอาออก)
- ห้ามส่งรหัสผ่านฐานข้อมูลในแชท ใส่ในช่อง Environment variables ของ DirectAdmin หรือ `.env.local` เท่านั้น
