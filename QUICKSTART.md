# Quick Start Guide

## For Windows Users - Easy Setup

### Option 1: Using Batch Files (Easiest)

1. **Start the Backend Server**
   - Double-click `start-backend.bat`
   - Wait for "Uvicorn running on http://0.0.0.0:8000" message
   - Keep this window open

2. **Start the Frontend**
   - Double-click `start-frontend.bat`
   - Wait for the browser to open automatically
   - If it doesn't, go to `http://localhost:3000`

3. **Start Monitoring**
   - Click "Add Process" button
   - Search for a process (e.g., "chrome.exe" or "notepad.exe")
   - Click on the process to select it
   - Click "Add"
   - Watch the real-time metrics appear!

### Option 2: Manual Setup

#### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

#### Frontend (in a new terminal)
```bash
cd frontend
npm install
npm run dev
```

## First Time Usage

### 1. Add Your First Process

The easiest processes to monitor for testing:
- **notepad.exe** - Open Notepad first, then add it
- **chrome.exe** - If you use Chrome
- **explorer.exe** - Windows Explorer (always running)
- **Code.exe** - VS Code editor

Steps:
1. Make sure the application is running
2. Click "Add Process" in top-right
3. Search for the process name
4. Click on it, then click "Add"

### 2. View Real-time Metrics

Once added, you'll see:
- CPU usage percentage
- RAM usage (MB and %)
- Disk read/write rates
- Network send/receive rates
- Uptime

All metrics update every 2 seconds automatically!

### 3. View Historical Charts

1. Click on any process row in the table
2. Scroll down to see 4 beautiful charts:
   - **CPU Usage** - Line chart showing CPU% over time
   - **Memory Usage** - Area chart showing RAM usage
   - **Disk I/O** - Read and Write rates
   - **Network** - Upload and Download rates

Charts show the last 60 seconds of data!

### 4. Set Up Alerts

1. Click the Settings ⚙️ icon (top-right)
2. Adjust thresholds:
   - CPU Threshold: Default 80%
   - RAM Threshold: Default 80%
   - Disk I/O: Default 100 MB/s
   - Network: Default 50 MB/s
3. Click "Save"

When a process exceeds these thresholds, you'll see:
- Row highlighted in red
- Alert count badge on the alert icon 🔔

### 5. View Alerts

1. Click the Alert 🔔 icon (top-right)
2. See all alerts with:
   - Which process triggered it
   - What metric exceeded the threshold
   - When it happened
   - The exact value

### 6. Export Your Data

1. Click the Download ⬇️ icon (top-right)
2. Choose format:
   - **CSV** - For Excel/Google Sheets
   - **Excel** - Pre-formatted .xlsx file
3. File downloads automatically with timestamp

### 7. Toggle Dark Mode

Click the 🌙 Moon icon (top-right) to switch to dark mode!
Click the ☀️ Sun icon to go back to light mode.

## Example Monitoring Scenarios

### Scenario 1: Monitor Chrome Browser
```
1. Open Chrome
2. Add "chrome.exe" to monitor
3. Open multiple tabs to see CPU/RAM increase
4. Watch real-time metrics update
5. Click on Chrome row to see charts
```

### Scenario 2: Find Memory Leaks
```
1. Add your application process
2. Set RAM threshold to 70%
3. Use your application normally
4. If RAM keeps increasing, check alerts
5. Export data to CSV for analysis
```

### Scenario 3: Monitor Server Application
```
1. Add your server process (e.g., "node.exe", "python.exe")
2. Set appropriate thresholds based on normal usage
3. Monitor CPU and Network metrics
4. Set alerts for unusual activity
5. Export hourly reports for review
```

## Tips & Tricks

### Getting Better Data
- **Run as Administrator**: For complete access to all processes
- **Monitor for longer**: Let it run for a few minutes to see trends
- **Compare processes**: Add multiple processes to compare resource usage

### Understanding the Metrics

**CPU %**
- 0-25%: Low usage
- 25-50%: Moderate usage
- 50-80%: High usage
- 80-100%: Very high usage (may cause slowdowns)

**Memory %**
- 0-30%: Normal
- 30-60%: Moderate
- 60-80%: High (monitor for leaks)
- 80-100%: Critical (may cause system issues)

**Disk I/O**
- 0-10 MB/s: Normal
- 10-50 MB/s: Moderate
- 50-100 MB/s: High
- 100+ MB/s: Very high (database, video editing, etc.)

**Network**
- 0-1 MB/s: Normal browsing
- 1-10 MB/s: Moderate (streaming, downloads)
- 10-50 MB/s: High (large downloads, uploads)
- 50+ MB/s: Very high (servers, transfers)

### Troubleshooting Quick Fixes

**Can't find a process?**
- Make sure it's actually running (check Task Manager)
- Include .exe extension (e.g., "chrome.exe" not "chrome")
- Try running backend as Administrator

**Metrics show 0?**
- Some metrics require time to calculate
- Wait 2-4 seconds for first reading
- Process may be idle (not using resources)

**WebSocket disconnected?**
- Check if backend is still running
- Refresh the browser page
- Restart both backend and frontend

**High CPU usage from the monitor itself?**
- Normal during first few seconds
- Should stabilize to <5% CPU usage
- Reduce number of monitored processes if needed

## Keyboard Shortcuts

- **Ctrl + R**: Refresh the page
- **F5**: Reload and reconnect
- **Ctrl + Click**: Open multiple modals (not recommended)
- **Esc**: Close modals (future feature)

## What to Monitor?

### Good Candidates:
- ✅ Web browsers (Chrome, Firefox, Edge)
- ✅ Development tools (VS Code, Visual Studio)
- ✅ Database servers (MySQL, PostgreSQL, MongoDB)
- ✅ Web servers (Node.js, Python, Apache)
- ✅ Game clients
- ✅ Video/audio editing software

### Not Recommended:
- ❌ System processes (may require special permissions)
- ❌ Very short-lived processes (will disconnect frequently)
- ❌ Too many processes at once (>20 may slow down UI)

## Next Steps

Once you're comfortable with the basics:

1. **Customize Thresholds**: Adjust based on your hardware
2. **Regular Exports**: Export data weekly for trend analysis
3. **Set Up Monitoring Routine**: Check alerts daily
4. **Document Baselines**: Note normal resource usage for comparison
5. **Configure Auto-start**: Set up batch files to run on system startup

## Need Help?

1. Check [SETUP.md](SETUP.md) for detailed installation guide
2. Read [FEATURES.md](FEATURES.md) for complete feature list
3. Review [README.md](README.md) for API documentation
4. Check `backend/logs/monitor.log` for error details

Happy Monitoring! 🚀
