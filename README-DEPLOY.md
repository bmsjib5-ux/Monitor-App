# MonitorApp - คู่มือการติดตั้ง

## ความต้องการของระบบ

- Windows 10/11
- Python 3.10 หรือสูงกว่า
- RAM: 2GB ขึ้นไป
- Disk: 500MB

## การติดตั้ง Python

1. ดาวน์โหลด Python จาก https://python.org/downloads
2. รัน installer
3. **สำคัญ**: ติ๊กเลือก "Add Python to PATH"
4. คลิก "Install Now"

## การติดตั้ง MonitorApp

### วิธีที่ 1: ติดตั้งอัตโนมัติ

1. ดับเบิ้ลคลิก `install-client.bat`
2. รอให้ติดตั้ง dependencies เสร็จ
3. รัน `start-client.bat` เพื่อเริ่มใช้งาน

### วิธีที่ 2: รันอัตโนมัติตอน Startup

1. คลิกขวา `install-as-service.bat` > Run as administrator
2. โปรแกรมจะรันอัตโนมัติเมื่อเปิดเครื่อง

## การใช้งาน

### Client Mode (สำหรับเครื่องที่ต้องการ Monitor)

1. รัน `start-client.bat`
2. เปิด Browser ไปที่ http://localhost:3001
3. เลือก **Client Mode**
4. คลิก "Add Process" เพื่อเพิ่ม Process ที่ต้องการ Monitor
5. Process ที่เพิ่มไว้จะถูกจำไว้ แม้ปิดโปรแกรมแล้วเปิดใหม่

### Master Mode (สำหรับ Admin ดูข้อมูลทุกเครื่อง)

1. รัน `start-client.bat`
2. เปิด Browser ไปที่ http://localhost:3001
3. เลือก **Master Mode**
4. Login ด้วย:
   - Username: `admin`
   - Password: `bmshosxp!@#$`
5. ดูข้อมูล Process จากทุกสถานพยาบาล

## โครงสร้าง

```
MonitorApp/
├── backend/              # Python FastAPI Backend
│   ├── main.py          # Main API server
│   ├── process_monitor.py
│   ├── requirements.txt
│   └── data/            # ข้อมูลที่บันทึกไว้
├── frontend/
│   └── dist/            # Built React frontend
├── install-client.bat   # Script ติดตั้ง
├── start-client.bat     # Script รันโปรแกรม
└── README-DEPLOY.md     # ไฟล์นี้
```

## การตั้งค่า Supabase (สำหรับ Master Mode)

ไฟล์ `.env` ใน folder `backend/`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
```

## การแก้ไขปัญหา

### Port 3001 ใช้งานอยู่

```cmd
netstat -ano | findstr :3001
taskkill /PID <PID> /F
```

### Python ไม่พบ

- ตรวจสอบว่าติดตั้ง Python แล้ว
- ตรวจสอบว่า Python อยู่ใน PATH

### ติดตั้ง Dependencies ไม่ได้

```cmd
cd backend
pip install --upgrade pip
pip install -r requirements.txt
```

## การอัพเดท

1. หยุดโปรแกรมที่กำลังรัน (Ctrl+C)
2. คัดลอกไฟล์ใหม่ทับ
3. รัน `start-client.bat` ใหม่

## ติดต่อ

หากมีปัญหา กรุณาติดต่อผู้ดูแลระบบ
