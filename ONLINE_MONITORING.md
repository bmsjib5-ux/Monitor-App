# Online Monitoring Guide

## ภาพรวมระบบ

MonitorApp ตอนนี้รองรับ **Online Monitoring** แล้ว! คุณสามารถติดตาม server และ application จากระยะไกลผ่าน internet ได้

### สถาปัตยกรรม

```
┌─────────────────┐
│  Web Dashboard  │  ← แสดงผลข้อมูลทุก host
└────────┬────────┘
         │
    ┌────▼─────┐
    │  Central │  ← Backend Server (main.py)
    │  Server  │
    └────┬─────┘
         │
    ┌────┴────────────────┐
    │                     │
┌───▼────┐          ┌────▼────┐
│ Agent1 │          │ Agent2  │  ← Agents บน remote servers
│(Local) │          │(Remote) │
└────────┘          └─────────┘
```

---

## 🚀 Quick Start

### 1. Setup Central Server

Central Server คือ backend หลักที่รับข้อมูลจาก agents

```bash
# เริ่ม central server
cd MonitorApp
start-backend.bat

# หรือ manual
cd backend
python main.py
```

Server จะรันที่: `http://0.0.0.0:8000`

### 2. Setup Agent บน Remote Server

#### Option 1: ใช้ Batch File (Windows)

1. คัดลอก folder `backend` ไปยัง remote server
2. สร้างไฟล์ `.env` ใน folder backend:
   ```
   CENTRAL_SERVER_URL=http://your-central-server-ip:8000
   AGENT_API_KEY=will-be-generated-on-registration
   ```
3. รัน `start-agent.bat`

#### Option 2: Manual Setup

```bash
# บน remote server
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac

pip install -r requirements.txt

# ตั้งค่า environment variables
set CENTRAL_SERVER_URL=http://central-server-ip:8000
set AGENT_API_KEY=your-api-key

# รัน agent
python agent.py
```

### 3. เปิด Web Dashboard

```bash
# เริ่ม frontend
start-frontend.bat

# เปิดเบราว์เซอร์ที่
http://localhost:3001
```

---

## 📡 การทำงานของระบบ

### Agent → Central Server Communication

1. **Registration** (ครั้งแรก)
   - Agent ลงทะเบียนกับ Central Server
   - ได้รับ `host_id` และ `api_key` กลับมา

2. **Heartbeat** (ทุก 30 วินาที)
   - Agent ส่ง heartbeat เพื่อบอกสถานะ
   - Central Server อัพเดทสถานะ (online/offline)

3. **Process List** (ทุก 30 วินาที)
   - Agent ดึงรายการ processes ที่ต้อง monitor
   - จาก Central Server

4. **Metrics** (ทุก 2 วินาที)
   - Agent เก็บ metrics (CPU, RAM, Disk, Network)
   - ส่งไปยัง Central Server

5. **WebSocket Broadcast** (ทุก 2 วินาที)
   - Central Server ส่งข้อมูลทุก host
   - ไปยัง Web Dashboard แบบ real-time

---

## 🔐 Security & API Keys

### API Key Authentication

ทุก request จาก Agent ไปยัง Central Server ต้องมี API Key:

```http
POST /api/agents/heartbeat
Headers:
  X-API-Key: your-api-key-here
```

### การสร้าง API Key

**แบบอัตโนมัติ (Recommended):**
- Agent จะได้รับ API key หลังลงทะเบียนอัตโนมัติ

**แบบ Manual:**
- ใช้ UUID generator
- บันทึกลงใน `.env` file

**Production Tips:**
- ใช้ API Key ที่แตกต่างกันสำหรับแต่ละ agent
- เก็บ API Key ใน environment variables หรือ secrets manager
- ใช้ HTTPS สำหรับการสื่อสาร
- ตั้งค่า firewall ให้อนุญาตเฉพาะ IP ที่เชื่อถือได้

---

## 📊 API Endpoints

### Agent Endpoints (ใช้โดย Agent)

#### 1. Register Agent
```http
POST /api/agents/register
Headers:
  X-API-Key: master-key (optional)
Body:
{
  "hostname": "server-01",
  "ip_address": "192.168.1.100",
  "os_type": "Windows",
  "agent_version": "1.0.0"
}

Response:
{
  "success": true,
  "host_id": "uuid",
  "api_key": "generated-api-key",
  "message": "Agent registered successfully"
}
```

#### 2. Send Heartbeat
```http
POST /api/agents/heartbeat
Headers:
  X-API-Key: your-api-key
Body:
{
  "host_id": "uuid",
  "timestamp": "2025-11-06T12:00:00",
  "status": "online",
  "process_count": 5
}
```

#### 3. Get Monitored Processes
```http
GET /api/agents/{host_id}/processes
Headers:
  X-API-Key: your-api-key

Response:
{
  "processes": ["chrome.exe", "node.exe"]
}
```

#### 4. Send Metrics
```http
POST /api/agents/{host_id}/metrics
Headers:
  X-API-Key: your-api-key
Body:
{
  "host_id": "uuid",
  "hostname": "server-01",
  "timestamp": "2025-11-06T12:00:00",
  "processes": [
    {
      "name": "chrome.exe",
      "pid": 1234,
      "status": "running",
      "cpu_percent": 25.5,
      "memory_mb": 512.0,
      "memory_percent": 3.2,
      ...
    }
  ]
}
```

### Management Endpoints (ใช้โดย Dashboard)

#### 5. Get All Hosts
```http
GET /api/hosts

Response:
[
  {
    "host_id": "uuid",
    "hostname": "server-01",
    "ip_address": "192.168.1.100",
    "os_type": "Windows",
    "status": "online",
    "last_seen": "2025-11-06T12:00:00"
  }
]
```

#### 6. Get Host Processes
```http
GET /api/hosts/{host_id}/processes

Response:
[
  {
    "host_id": "uuid",
    "hostname": "server-01",
    "name": "chrome.exe",
    "pid": 1234,
    "status": "running",
    "cpu_percent": 25.5,
    ...
  }
]
```

#### 7. Add Process to Monitor
```http
POST /api/hosts/{host_id}/processes
Body:
{
  "name": "node.exe"
}
```

#### 8. Remove Process
```http
DELETE /api/hosts/{host_id}/processes/{process_name}
```

#### 9. Get All Processes (All Hosts)
```http
GET /api/multi-host/processes

Response: Array of all processes from all hosts
```

#### 10. Get Statistics
```http
GET /api/stats

Response:
{
  "local": {
    "local_processes": 2
  },
  "remote": {
    "total_hosts": 3,
    "online_hosts": 2,
    "offline_hosts": 1,
    "total_processes": 15
  },
  "total_processes": 17
}
```

---

## 🔧 Configuration

### Backend Configuration (config.py)

```python
# Server settings
host: str = "0.0.0.0"
port: int = 8000

# Monitoring settings
update_interval: int = 2  # seconds
history_length: int = 60  # data points

# Resource thresholds
cpu_threshold: float = 80.0  # percentage
ram_threshold: float = 80.0  # percentage
```

### Agent Configuration (.env)

```bash
# Central server URL
CENTRAL_SERVER_URL=http://192.168.1.50:8000

# Agent API Key (received after registration)
AGENT_API_KEY=your-unique-api-key
```

---

## 🌐 Network Configuration

### Firewall Rules

**Central Server:**
- เปิด port 8000 (HTTP API)
- เปิด port 3000 (Frontend)

**Remote Servers:**
- ต้องสามารถเชื่อมต่อออกไปยัง Central Server port 8000

### For Internet Access

1. **Central Server:**
   - ต้องมี Public IP หรือใช้ Dynamic DNS
   - ตั้งค่า Port Forwarding: 8000 → Internal IP

2. **Agent:**
   - ใช้ Public IP/Domain ของ Central Server
   - ตัวอย่าง: `http://monitor.yourdomain.com:8000`

### การใช้งานใน LAN

```bash
# ตัวอย่าง LAN Configuration
Central Server: 192.168.1.50
Agent 1: 192.168.1.100
Agent 2: 192.168.1.101

# Agent .env
CENTRAL_SERVER_URL=http://192.168.1.50:8000
```

---

## 📈 Monitoring Multiple Servers

### Use Cases

#### 1. Web Application Stack
```
- Host 1: Frontend Server (nginx)
- Host 2: Backend Server (node.exe, python.exe)
- Host 3: Database Server (postgres.exe)
- Host 4: Cache Server (redis.exe)
```

#### 2. Microservices
```
- Host 1: API Gateway
- Host 2: User Service
- Host 3: Order Service
- Host 4: Payment Service
```

#### 3. Development Environment
```
- Host 1: Development Machine
- Host 2: Test Server
- Host 3: Staging Server
```

---

## 🐛 Troubleshooting

### Agent ไม่สามารถเชื่อมต่อ Central Server

**ตรวจสอบ:**
1. ✅ Central Server รันอยู่หรือไม่
2. ✅ Firewall อนุญาต port 8000 หรือไม่
3. ✅ `CENTRAL_SERVER_URL` ถูกต้องหรือไม่
4. ✅ Network connectivity (ping)

```bash
# ทดสอบการเชื่อมต่อ
curl http://central-server-ip:8000/

# ควรได้
{"name":"Windows Application Monitor","version":"1.0.0","status":"running"}
```

### API Key Invalid

**แก้ไข:**
1. ลงทะเบียน agent ใหม่
2. บันทึก API key ที่ได้รับ
3. อัพเดท `.env` file
4. รีสตาร์ท agent

### Host แสดงสถานะ Offline

**สาเหตุ:**
- Agent หยุดทำงาน
- ไม่มี heartbeat มาเกิน 2 นาที
- Network ขาดหาย

**แก้ไข:**
- รีสตาร์ท agent
- ตรวจสอบ network
- ดู agent logs

### ข้อมูลไม่อัพเดท Real-time

**ตรวจสอบ:**
1. WebSocket connection (ดูใน Browser Console)
2. Backend logs มี error หรือไม่
3. Agent ส่งข้อมูลหรือไม่ (ดู backend logs)

---

## 📝 Best Practices

### 1. Naming Convention
```
hostname: server-prod-01
hostname: server-dev-web-01
hostname: db-master-01
```

### 2. Process Monitoring
- Monitor เฉพาะ critical processes
- ไม่ควรเกิน 10-15 processes ต่อ host
- ตั้งชื่อให้ชัดเจน (เช่น nginx.exe, node.exe)

### 3. Alerting
- ตั้ง threshold ให้เหมาะสมกับแต่ละ server
- Database server: RAM threshold สูงกว่า
- Web server: Network threshold สูงกว่า

### 4. Security
- ✅ ใช้ HTTPS (ใส่ reverse proxy เช่น nginx)
- ✅ เปลี่ยน API key เป็นระยะ
- ✅ จำกัด IP ที่สามารถเชื่อมต่อได้
- ✅ ใช้ VPN สำหรับ production

### 5. Scalability
- แต่ละ host มี unique API key
- Central Server ควรมี CPU/RAM เพียงพอ
- พิจารณาใช้ database สำหรับ history (future)

---

## 🔄 Upgrade from Local to Online

หากคุณใช้ MonitorApp แบบ local อยู่:

1. **ไม่ต้องเปลี่ยนอะไร!**
   - Local monitoring ยังใช้งานได้ปกติ
   - เพิ่ม remote monitoring ได้เลย

2. **เพิ่ม Remote Host:**
   - ติดตั้ง agent บน remote server
   - Dashboard จะแสดงทั้ง local และ remote

3. **Migration:**
   - Local processes → แสดงใน "Local" tab
   - Remote processes → แสดงใน "Remote Hosts" tab

---

## 🎯 Next Steps

1. ✅ เริ่มต้นด้วย 1-2 agents ทดสอบ
2. ✅ Monitor critical processes
3. ✅ ตั้งค่า alerts ให้เหมาะสม
4. ✅ ทดสอบ failover scenarios
5. ✅ สร้าง documentation สำหรับทีม

---

## 💡 Tips

- **Agent logs**: ดูได้ที่ `backend/logs/agent.log`
- **Server logs**: ดูได้ที่ `backend/logs/monitor.log`
- **Performance**: Agent ใช้ resources น้อยมาก (~5-10 MB RAM)
- **Bandwidth**: ~1-2 KB/s per agent (ไม่มากเลย)

---

## 📞 Support

ปัญหาหรือคำถาม:
1. ตรวจสอบ logs
2. อ่าน Troubleshooting section
3. ดู API documentation
4. ทดสอบ network connectivity

Happy Monitoring! 🚀
