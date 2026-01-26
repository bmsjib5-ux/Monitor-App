# 🌐 Online Monitoring - Quick Setup Guide

ติดตั้ง MonitorApp สำหรับ Multi-Host Monitoring ใน 5 นาที!

---

## 📋 สิ่งที่ต้องมี

- ✅ Python 3.8+ ติดตั้งบน Central Server
- ✅ Python 3.8+ ติดตั้งบน Remote Servers (ที่ต้องการ monitor)
- ✅ Network connectivity ระหว่าง Servers
- ✅ Port 8000 เปิดบน Central Server

---

## 🚀 Step 1: Setup Central Server

### 1.1 เริ่ม Backend Server

```bash
# Clone/Copy โปรเจกต์
cd MonitorApp

# Windows - ใช้ batch file
start-backend.bat

# หรือ Manual
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

✅ Server รันที่: `http://0.0.0.0:8000`

### 1.2 เริ่ม Frontend Dashboard

```bash
# Windows
start-frontend.bat

# หรือ Manual
cd frontend
npm install
npm run dev
```

✅ Dashboard เปิดที่: `http://localhost:3001`

---

## 🤖 Step 2: Setup Agent บน Remote Server

### 2.1 เตรียม Agent Files

**วิธีที่ 1: คัดลอกทั้ง folder backend**
```bash
# คัดลอก folder MonitorApp/backend ไปยัง remote server
# ตำแหน่งใดก็ได้ เช่น C:\MonitorApp\backend
```

**วิธีที่ 2: Download เฉพาะไฟล์ที่จำเป็น**
```
backend/
├── agent.py          # Agent script หลัก
├── requirements.txt  # Python dependencies
└── .env             # Configuration (สร้างใหม่)
```

### 2.2 สร้างไฟล์ .env

สร้างไฟล์ `.env` ใน folder backend:

```bash
# .env
CENTRAL_SERVER_URL=http://192.168.1.50:8000
AGENT_API_KEY=temp-key-will-update-later
```

⚠️ **สำคัญ:** เปลี่ยน `192.168.1.50` เป็น IP ของ Central Server

### 2.3 ติดตั้ง Dependencies

```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac

pip install -r requirements.txt
```

### 2.4 รัน Agent

**Windows:**
```bash
start-agent.bat
```

**Manual:**
```bash
python agent.py
```

### 2.5 บันทึก API Key

เมื่อ Agent รันครั้งแรก จะเห็น output:

```
Agent registered successfully. Host ID: abc-123-def
API Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

✅ **คัดลอก API Key** และอัพเดทใน `.env`:
```bash
AGENT_API_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

✅ รีสตาร์ท Agent

---

## 📊 Step 3: เพิ่ม Processes เพื่อ Monitor

### 3.1 ผ่าน Web Dashboard

1. เปิด http://localhost:3001
2. คลิก "Hosts" ดู remote servers ที่เชื่อมต่อ
3. เลือก host ที่ต้องการ
4. คลิก "Add Process"
5. เลือก process (เช่น chrome.exe, node.exe)
6. คลิก "Add"

### 3.2 ผ่าน API (curl)

```bash
# ดู host_id
curl http://localhost:8000/api/hosts

# เพิ่ม process
curl -X POST http://localhost:8000/api/hosts/{host_id}/processes \
  -H "Content-Type: application/json" \
  -d '{"name": "chrome.exe"}'
```

---

## 🎯 Step 4: ดู Real-time Metrics

กลับไปที่ Dashboard:
- ดู **Local Processes** = processes บน Central Server
- ดู **Remote Hosts** = processes จาก Agents
- Real-time updates ทุก 2 วินาที
- Charts แสดง CPU, RAM, Disk, Network

---

## 🔧 ตัวอย่างการใช้งาน

### Scenario 1: Monitor 3 Servers

```
Central Server (192.168.1.50):
  - รัน backend + frontend
  - Monitor: postgres.exe, nginx.exe

Web Server (192.168.1.100):
  - รัน agent.py
  - Monitor: nginx.exe, node.exe

App Server (192.168.1.101):
  - รัน agent.py
  - Monitor: python.exe, redis-server.exe
```

### Scenario 2: Internet Monitoring

```
Central Server (Public IP: 203.0.113.50):
  - Port forwarding: 8000 → 192.168.1.50:8000
  - รัน backend

Remote Office (Any Location):
  - Agent .env: CENTRAL_SERVER_URL=http://203.0.113.50:8000
  - รัน agent.py
```

---

## ⚙️ Configuration Tips

### Central Server

**config.py:**
```python
update_interval: int = 2      # วินาที (เร็วขึ้น = load มากขึ้น)
history_length: int = 60      # จำนวน data points
cpu_threshold: float = 80.0   # %
ram_threshold: float = 80.0   # %
```

### Agent

**.env:**
```bash
CENTRAL_SERVER_URL=http://server:8000  # ⚠️ ต้องถูกต้อง!
AGENT_API_KEY=your-key-here            # ⚠️ ได้จากการ register
```

**agent.py (ถ้าต้องการปรับ):**
```python
heartbeat_interval = 30  # วินาที
metrics_interval = 2     # วินาที
```

---

## 🐛 Troubleshooting

### ❌ Agent: "Failed to register"

**สาเหตุ:**
- Central Server ไม่ได้รัน
- URL ผิด
- Network blocked

**แก้ไข:**
```bash
# ทดสอบ connectivity
curl http://central-server-ip:8000/

# ควรได้
{"name":"Windows Application Monitor","version":"1.0.0","status":"running"}
```

### ❌ Agent: "API key invalid"

**แก้ไข:**
1. ลบ API_KEY ใน .env (หรือเปลี่ยนเป็น "temp")
2. รัน agent ใหม่ → ได้ API key ใหม่
3. อัพเดท .env
4. รีสตาร์ท

### ❌ Dashboard: Host แสดง "offline"

**สาเหตุ:**
- Agent หยุดทำงาน
- ไม่มี heartbeat มาเกิน 2 นาที

**แก้ไข:**
- รีสตาร์ท agent
- ตรวจสอบ network

### ❌ Process ไม่แสดงข้อมูล

**สาเหตุ:**
- Process ไม่ได้รัน
- ชื่อ process ผิด (ต้องใส่ .exe)

**แก้ไข:**
```bash
# ดู process ที่มี
curl http://localhost:8000/api/available-processes
```

---

## 📚 คำสั่งที่มักใช้

### ตรวจสอบ Status

```bash
# ดู hosts ทั้งหมด
curl http://localhost:8000/api/hosts

# ดู processes ของ host
curl http://localhost:8000/api/hosts/{host_id}/processes

# ดู statistics
curl http://localhost:8000/api/stats
```

### จัดการ Hosts

```bash
# เพิ่ม process
curl -X POST http://localhost:8000/api/hosts/{host_id}/processes \
  -H "Content-Type: application/json" \
  -d '{"name": "process.exe"}'

# ลบ process
curl -X DELETE http://localhost:8000/api/hosts/{host_id}/processes/process.exe

# ลบ host
curl -X DELETE http://localhost:8000/api/hosts/{host_id}
```

---

## 🎓 ขั้นตอนต่อไป

1. ✅ อ่าน [ONLINE_MONITORING.md](ONLINE_MONITORING.md) สำหรับรายละเอียดเพิ่มเติม
2. ✅ ตั้งค่า HTTPS ด้วย nginx/Apache (for production)
3. ✅ ตั้งค่า alerts สำหรับ critical processes
4. ✅ Export ข้อมูลไปวิเคราะห์ (CSV/Excel)
5. ✅ สร้าง monitoring routine

---

## 🔐 Security Checklist (Production)

- [ ] ใช้ HTTPS แทน HTTP
- [ ] เปลี่ยน API keys เป็นระยะ
- [ ] ตั้งค่า firewall rules
- [ ] จำกัด CORS origins
- [ ] ใช้ VPN สำหรับ remote access
- [ ] Enable authentication (future feature)

---

## 💡 Pro Tips

1. **ตั้งชื่อ hostname ให้ชัดเจน**
   ```
   server-prod-web-01
   server-prod-db-01
   server-dev-api-01
   ```

2. **Monitor เฉพาะ critical processes**
   - ไม่ควรเกิน 10-15 processes ต่อ host
   - เลือก processes ที่สำคัญจริงๆ

3. **ใช้ batch files**
   - สร้าง `start-agent.bat` สำหรับแต่ละ server
   - ตั้งให้รันอัตโนมัติตอน boot

4. **Check logs**
   - Agent logs: `backend/logs/agent.log`
   - Server logs: `backend/logs/monitor.log`

---

## ✨ คุณสมบัติเด่น

✅ **Real-time Monitoring** - อัพเดททุก 2 วินาที
✅ **Multi-Host** - Monitor หลาย servers พร้อมกัน
✅ **Lightweight** - Agent ใช้ resources น้อย (~5-10 MB)
✅ **Secure** - API key authentication
✅ **Easy Setup** - ติดตั้งได้ภายใน 5 นาที
✅ **Web Dashboard** - ดูข้อมูลจากเบราว์เซอร์

---

Happy Monitoring! 🚀

สำหรับคำถามเพิ่มเติม ดู [ONLINE_MONITORING.md](ONLINE_MONITORING.md)
