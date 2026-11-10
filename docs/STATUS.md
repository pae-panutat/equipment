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

## 2. Deploy ขึ้นโฮสต์ — เสร็จแล้ว (10 พ.ย. 2026)

- เว็บบนโฮสต์เป็นเวอร์ชันใหม่ และ Restart แล้ว
- `https://equiplog.ddns.net/api/v1/health` ได้ `"ok":true,"db":"up"` และ `dbVersion` `10.11.19-MariaDB`
- phpMyAdmin ฐานข้อมูล `equiplog_cmu` มี 8 ตาราง (ว่าง): `__drizzle_migrations`, `app_meta`, `asset_types`, `assets`, `locations`, `maintenance_plans`, `organization_units`, `work_orders`
- ยังค้าง: ลบไฟล์เก่าใน `public_html/` (ดูหัวข้อ 4)

ถ้าเว็บขึ้น "Web application could not be started": กรอก *Passenger log file* เป็น `/home/equiplog/logs/passenger.log` → SAVE → Restart แล้วส่ง log ให้ผู้ช่วยอ่าน (อย่าให้มี password ติดมา)

## 3. สิ่งที่ควรเห็นบนโฮสต์ (ตั้งใจให้เป็นเช่นนั้น)

- หน้า Dashboard และทะเบียนอุปกรณ์จะขึ้น "ยังไม่เปิดใช้งาน: ต้องมีระบบเข้าสู่ระบบ" เพราะ API ข้อมูลถูกปิดบน production จนกว่าจะมี login
- ฐานข้อมูลบนโฮสต์มีแค่โครงตาราง ไม่มีข้อมูล (ข้อมูลสมมติอยู่เฉพาะในเครื่อง `equiplog_cmu_dev`)
- อย่าตั้ง `ALLOW_DEMO_DATA=true` บนโฮสต์จนกว่าจะมี login

## 4. ลบไฟล์เก่าบนโฮสต์ (ทำเองใน File Manager หลังเว็บใหม่ทำงานแล้ว)

- `domains/equiplog.ddns.net/public_html/` ลบเว็บเดิม: `index.html`, `400/401/403/404/500.shtml`, `logo.png`, `.ftp-deploy-sync-state.json`
  - **ห้ามลบ `.htaccess`** (Node.js Selector ใช้ตั้งค่า Passenger)
- `apps/equiplog/` ไม่ต้องลบอะไร (ระบบ deploy ลบไฟล์เก่าเอง) อย่าลบ `.ftp-deploy-sync-state.json`, `node_modules`, `tmp`

## 5. ตัดสินใจ/ทำต่อ (ตามแผนใน prompt)

- ชิ้นถัดไป: login + บทบาท/สิทธิ์ตามส่วนงาน (Super Admin, Unit Admin, Technician, Viewer, Public) แล้วค่อยเปิด API บน production
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
