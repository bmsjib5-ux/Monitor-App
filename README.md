# 🖥️ Windows Application Monitor

**Real-time Process Monitoring System with Web Interface**

---

## ⚡ Quick Start

```bash
# ดับเบิ้ลคลิก
start-all.bat
```

เปิด Browser ที่ **http://localhost:3001** อัตโนมัติ!

---

## ✅ Status

- ✅ Backend API: http://localhost:8000
- ✅ Frontend: http://localhost:3001
- ✅ Database: Supabase (Cloud PostgreSQL)
- ✅ WebSocket: Real-time updates
- ✅ Ready to use!

---

## 📚 Documentation

- **[START_HERE.md](START_HERE.md)** - 🎯 เริ่มใช้งานที่นี่ (แนะนำ)
- **[QUICK_START.md](QUICK_START.md)** - Quick start guide
- **[README_API.md](README_API.md)** - API documentation
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** - แก้ปัญหา
- **[FRONTEND_CONNECTED.md](FRONTEND_CONNECTED.md)** - Frontend setup
- **[SUPABASE_SETUP_SUCCESS.md](SUPABASE_SETUP_SUCCESS.md)** - Database setup
- **[WEBSOCKET_FIX.md](WEBSOCKET_FIX.md)** - WebSocket guide
- **[EDIT_SAVE_FEATURE.md](EDIT_SAVE_FEATURE.md)** - Edit/Save process metadata
- **[DATABASE_MIGRATION.md](DATABASE_MIGRATION.md)** - Database migration guide
- **[VIEWS_README.md](VIEWS_README.md)** - 📊 Supabase Views คู่มือย่อ ⭐ NEW!
- **[SUPABASE_VIEWS_GUIDE.md](SUPABASE_VIEWS_GUIDE.md)** - คู่มือ Views แบบละเอียด
- **[ALTER_TABLES_GUIDE.md](ALTER_TABLES_GUIDE.md)** - 🔧 อัปเดตโครงสร้างตาราง ⭐ NEW!

---

## 🎯 Features

✅ Real-time process monitoring
✅ CPU, Memory, Disk I/O, Network metrics
✅ Start/Stop/Restart processes
✅ **Edit process metadata (Hospital name, Program path)** ⭐ NEW!
✅ Customizable alerts
✅ Export to CSV/Excel
✅ WebSocket real-time updates
✅ Cloud database (Supabase)

---

## 🚀 How to Use

### 1. Start Everything
```bash
start-all.bat
```

### 2. Access Web Interface
```
http://localhost:3001
```

### 3. Monitor Processes
- Add processes to monitor
- View real-time metrics
- Get alerts
- Export data

### 4. Stop Everything
```bash
stop-all.bat
```

---

## 🔧 Prerequisites

- Python 3.8+
- Node.js 16+
- Supabase account (free)

---

## 📁 Batch Files

| File | Description |
|------|-------------|
| `start-all.bat` | ⭐ Start everything |
| `stop-all.bat` | Stop everything |
| `setup-backend.bat` | Setup (first time) |
| `start-api.bat` | Start backend only |
| `start-frontend.bat` | Start frontend only |
| `test-api.bat` | Test API connection |

---

## 💡 Tech Stack

**Backend:** FastAPI + Python + Supabase
**Frontend:** React + TypeScript + Vite
**Database:** Supabase (PostgreSQL)
**Real-time:** WebSocket

---

## 📞 Need Help?

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

---

**Happy Monitoring! 🎉**
