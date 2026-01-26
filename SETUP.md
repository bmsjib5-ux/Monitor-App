# Setup Guide - Windows Application Monitor

## Prerequisites

### Backend Requirements
- Python 3.8 or higher
- pip (Python package manager)

### Frontend Requirements
- Node.js 16 or higher
- npm or yarn

## Installation Steps

### 1. Backend Setup

Open a terminal in the project root directory and run:

```bash
cd backend
```

Create a virtual environment:
```bash
python -m venv venv
```

Activate the virtual environment:
- On Windows:
  ```bash
  venv\Scripts\activate
  ```
- On Linux/Mac:
  ```bash
  source venv/bin/activate
  ```

Install dependencies:
```bash
pip install -r requirements.txt
```

### 2. Frontend Setup

Open a new terminal in the project root directory and run:

```bash
cd frontend
```

Install dependencies:
```bash
npm install
```

## Running the Application

### Start the Backend Server

In the backend terminal (with virtual environment activated):

```bash
cd backend
python main.py
```

The backend server will start on `http://localhost:8000`

You should see output like:
```
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application started
INFO:     Uvicorn running on http://0.0.0.0:8000
```

### Start the Frontend Development Server

In the frontend terminal:

```bash
cd frontend
npm run dev
```

The frontend will start on `http://localhost:3000`

Your browser should automatically open to the application. If not, navigate to `http://localhost:3000`

## Using the Application

### 1. Add a Process to Monitor

- Click the "Add Process" button in the top right
- Either:
  - Type the exact process name (e.g., `chrome.exe`, `notepad.exe`)
  - Or search for and select from the list of running processes
- Click "Add" to start monitoring

### 2. View Real-time Metrics

- The main table shows all monitored processes with their current metrics
- Metrics update every 2 seconds automatically
- Rows highlight in red when resource usage exceeds thresholds

### 3. View Historical Charts

- Click on any row in the table to select a process
- Scroll down to see 4 charts showing:
  - CPU Usage over time
  - Memory Usage over time
  - Disk I/O (Read/Write) over time
  - Network Usage (Send/Receive) over time
- Charts display the last 60 data points (approximately 2 minutes of history)

### 4. Configure Alert Thresholds

- Click the Settings icon in the top right
- Adjust thresholds for:
  - CPU usage (%)
  - RAM usage (%)
  - Disk I/O (MB/s)
  - Network usage (MB/s)
- Click "Save" to apply changes

### 5. View Alerts

- Click the Alert icon (bell with badge) in the top right
- View all alerts triggered when processes exceed thresholds
- Recent alerts (last 5 minutes) are shown with a badge count

### 6. Export Data

- Click the Download icon in the top right
- Choose either:
  - Export CSV - For spreadsheet analysis
  - Export Excel - For formatted Excel reports
- File will download automatically with timestamp in filename

### 7. Toggle Dark/Light Mode

- Click the Moon/Sun icon in the top right to switch themes

## Troubleshooting

### Backend Issues

**Problem**: `ModuleNotFoundError` when starting backend
- **Solution**: Make sure virtual environment is activated and dependencies are installed:
  ```bash
  venv\Scripts\activate
  pip install -r requirements.txt
  ```

**Problem**: Backend can't access process information
- **Solution**: Run the backend with administrator privileges on Windows:
  - Right-click Command Prompt/PowerShell
  - Select "Run as Administrator"
  - Navigate to backend directory and run `python main.py`

**Problem**: Port 8000 already in use
- **Solution**: Either stop the other process using port 8000, or modify `backend/config.py` to use a different port

### Frontend Issues

**Problem**: `npm install` fails
- **Solution**: Clear npm cache and try again:
  ```bash
  npm cache clean --force
  npm install
  ```

**Problem**: Can't connect to backend
- **Solution**: Verify backend is running on port 8000 and check `frontend/vite.config.ts` proxy settings

**Problem**: WebSocket connection fails
- **Solution**: Check firewall settings and ensure WebSocket connections are allowed

### Common Issues

**Problem**: Process not found when adding
- **Solution**:
  - Verify the process is actually running (check Task Manager)
  - Use exact process name including `.exe` extension
  - Try running backend with administrator privileges

**Problem**: Network metrics show system-wide data instead of per-process
- **Solution**: This is a limitation of psutil on Windows. Network metrics show system-wide usage as process-specific network monitoring requires kernel-level access or packet sniffing.

## Configuration

### Modify Update Interval

Edit `backend/config.py`:

```python
update_interval: int = 2  # Change to desired seconds
```

### Modify History Length

Edit `backend/config.py`:

```python
history_length: int = 60  # Change to desired number of data points
```

### Change Default Thresholds

Edit `backend/config.py`:

```python
cpu_threshold: float = 80.0
ram_threshold: float = 80.0
disk_io_threshold: float = 100.0
network_threshold: float = 50.0
```

## Production Deployment

### Backend

For production deployment, use a production WSGI server:

```bash
pip install gunicorn
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

### Frontend

Build the production version:

```bash
cd frontend
npm run build
```

Serve the built files from the `frontend/dist` directory using any static file server.

## Support

For issues and questions:
- Check the troubleshooting section above
- Review logs in `backend/logs/monitor.log`
- Check browser console for frontend errors (F12 in most browsers)
