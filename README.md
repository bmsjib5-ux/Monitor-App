# 🖥️ Windows Application Monitor

**Real-time Process Monitoring System — Client/Master Split Architecture**

---

## 🏗️ Architecture

โปรเจกต์แยกเป็น 2 แอปอิสระ

| App | Type | Location | Purpose |
|---|---|---|---|
| **Client** | Electron desktop + Python backend | [client-app/](client-app/) | ติดตั้งที่เครื่อง user ปลายทาง — รัน FastAPI local + ส่งข้อมูลขึ้น Supabase |
| **Master** | Web (GitHub Pages) | [master-app/](master-app/) | Dashboard กลางสำหรับ admin — อ่าน/เขียน Supabase โดยตรง ไม่ต้องมี backend |

ทั้งสองแอปคุยกันผ่าน **Supabase** เป็นตัวกลาง (ไม่มี direct connection)

---

## ⚡ Quick Start

### Client (Desktop)
```bash
start-all.bat
```
เปิด Browser ที่ **http://localhost:3001** อัตโนมัติ

### Master (Web)
- Production: https://bmsjib5-ux.github.io/MonitorApp/
- Dev: `cd master-app && npm run dev` → http://localhost:5174

---

## 📁 Structure

```
MonitorApp/
├── client-app/                  💻 Desktop client (Electron + FastAPI)
│   ├── backend/                 Python FastAPI (port 3001) + agent.py
│   ├── electron/                Electron main process
│   ├── src/                     React UI — ClientDashboard
│   ├── package.json             monitor-app-client
│   └── installer.iss (ที่ root) NSIS installer config
│
├── master-app/                  🖥️ Web master dashboard (GitHub Pages)
│   ├── src/                     React UI — MasterDashboard + GitHubPagesDashboard
│   ├── package.json             monitor-app-master (no Electron deps)
│   └── vite.config.ts           base: /MonitorApp/ for GH Pages
│
├── .github/workflows/
│   └── deploy-pwa.yml           Auto-deploy master-app on push to main
│
├── start-all.bat                Start client backend + open browser
├── start-backend.bat            Start FastAPI only
├── installer.iss                NSIS installer for client desktop app
└── *.sql                        Supabase migration scripts
```

---

## 🚀 Deployment

### Client (Desktop Installer)
```bash
cd client-app
npm run electron:build:installer
```
Output: `client-app/release/MonitorApp-Client-Setup-x.x.x.exe`

### Master (GitHub Pages)
Push to `main` branch → GitHub Actions ([.github/workflows/deploy-pwa.yml](.github/workflows/deploy-pwa.yml)) deploys automatically.

Manual build:
```bash
cd master-app
npm run build
```

---

## 🔧 Prerequisites

- Python 3.8+
- Node.js 16+
- Supabase account (free) — โครงสร้าง DB ใน `*.sql` ไฟล์

---

## 💡 Tech Stack

**Client backend:** FastAPI + Python + psutil + LINE OA + Supabase
**Frontend (both):** React 18 + TypeScript + Vite + Tailwind + shadcn/ui
**Database:** Supabase (PostgreSQL) — shared between client and master
**Real-time:** Supabase Realtime (master) + WebSocket (client local)

---

## 📞 Need Help?

ดู [TROUBLESHOOTING.md](TROUBLESHOOTING.md) หรือ [FEATURES.md](FEATURES.md)
