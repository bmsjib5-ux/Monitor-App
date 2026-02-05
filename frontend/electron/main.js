const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const net = require('net');

// Keep references to prevent garbage collection
let mainWindow = null;
let tray = null;
let pythonProcess = null;
let isQuitting = false;
let backendLogs = [];

// Configuration
const isDev = !app.isPackaged;
const BACKEND_PORT = 3001;
const BACKEND_HOST = '127.0.0.1';

// Logging
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  backendLogs.push(logMessage);
  // Keep only last 100 logs
  if (backendLogs.length > 100) {
    backendLogs.shift();
  }
}

// Get paths
function getBackendPath() {
  if (isDev) {
    return path.join(__dirname, '..', '..', 'backend');
  }
  return path.join(process.resourcesPath, 'backend');
}

function getPythonPath() {
  // FIRST: Try embedded Python (bundled with app)
  const embeddedPython = path.join(process.resourcesPath, 'python', 'python.exe');
  if (fs.existsSync(embeddedPython)) {
    log(`Using embedded Python: ${embeddedPython}`);
    return embeddedPython;
  }

  // For development: try python-embed folder
  if (isDev) {
    const devEmbedded = path.join(__dirname, '..', 'python-embed', 'python.exe');
    if (fs.existsSync(devEmbedded)) {
      log(`Using dev embedded Python: ${devEmbedded}`);
      return devEmbedded;
    }
  }

  log('Embedded Python not found, trying system Python...');

  // Fallback: Try to find Python in common locations
  const pythonCommands = ['python', 'python3', 'py'];
  const localAppData = process.env.LOCALAPPDATA || '';
  const userProfile = process.env.USERPROFILE || '';

  const pythonPaths = [
    path.join(localAppData, 'Programs', 'Python', 'Python313', 'python.exe'),
    path.join(localAppData, 'Programs', 'Python', 'Python312', 'python.exe'),
    path.join(localAppData, 'Programs', 'Python', 'Python311', 'python.exe'),
    path.join(localAppData, 'Programs', 'Python', 'Python310', 'python.exe'),
    'C:\\Python313\\python.exe',
    'C:\\Python312\\python.exe',
    'C:\\Python311\\python.exe',
    path.join(userProfile, 'anaconda3', 'python.exe'),
    path.join(userProfile, 'miniconda3', 'python.exe'),
  ];

  // Try absolute paths
  for (const pythonPath of pythonPaths) {
    if (fs.existsSync(pythonPath)) {
      log(`Found Python at: ${pythonPath}`);
      return pythonPath;
    }
  }

  // Try commands via shell
  for (const cmd of pythonCommands) {
    try {
      const result = spawnSync(cmd, ['--version'], { encoding: 'utf8', timeout: 5000, shell: true });
      if (result.status === 0) {
        log(`Found Python via command: ${cmd}`);
        return cmd;
      }
    } catch (e) {
      // Continue
    }
  }

  log('Python not found');
  return null;
}

// Check if port is available
function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, '0.0.0.0');
    server.on('listening', () => {
      server.close();
      resolve(true);
    });
    server.on('error', () => {
      resolve(false);
    });
  });
}

// Check if backend is already running and responding
function checkBackendHealth() {
  return new Promise((resolve) => {
    const req = require('http').request({
      host: BACKEND_HOST,
      port: BACKEND_PORT,
      path: '/health',
      method: 'GET',
      timeout: 3000
    }, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => resolve(false));
    req.end();
  });
}

// Kill process using a specific port (Windows)
function killProcessOnPort(port) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve(false);
      return;
    }

    log(`Attempting to kill process on port ${port}...`);

    // Method 1: Use netstat to find PIDs
    try {
      const netstatResult = spawnSync('cmd', ['/c', `netstat -ano | findstr :${port}`], {
        encoding: 'utf8',
        timeout: 10000
      });

      if (netstatResult.stdout) {
        const lines = netstatResult.stdout.trim().split('\n');
        const pids = new Set();

        for (const line of lines) {
          // Match lines with our port (could be LISTENING or ESTABLISHED)
          if (line.includes(`:${port} `) || line.includes(`:${port}\t`)) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 5) {
              const pid = parts[parts.length - 1];
              if (pid && !isNaN(pid) && parseInt(pid) > 0) {
                pids.add(pid);
              }
            }
          }
        }

        if (pids.size > 0) {
          log(`Found ${pids.size} process(es) using port ${port}: ${Array.from(pids).join(', ')}`);

          let killed = 0;
          for (const pid of pids) {
            log(`Killing PID ${pid}...`);
            const kill = spawnSync('taskkill', ['/F', '/PID', pid, '/T'], {
              encoding: 'utf8',
              timeout: 5000
            });
            if (kill.status === 0) {
              killed++;
              log(`Successfully killed PID ${pid}`);
            } else {
              log(`Failed to kill PID ${pid}: ${kill.stderr || kill.stdout || 'unknown error'}`);
            }
          }

          if (killed > 0) {
            log(`Killed ${killed} process(es), waiting for port to be released...`);
            // Wait longer for port to be released
            setTimeout(() => resolve(true), 2000);
            return;
          }
        } else {
          log('No process found using port (from netstat)');
        }
      }
    } catch (e) {
      log(`Error running netstat: ${e.message}`);
    }

    // Method 2: Try to kill any python.exe processes that might be our backend
    try {
      log('Trying to kill any python processes that might be the backend...');
      const wmic = spawnSync('cmd', ['/c', 'wmic process where "name=\'python.exe\'" get processid,commandline'], {
        encoding: 'utf8',
        timeout: 10000
      });

      if (wmic.stdout) {
        const lines = wmic.stdout.trim().split('\n');
        for (const line of lines) {
          if (line.includes('main.py') || line.includes('run_server.py') || line.includes('uvicorn')) {
            const pidMatch = line.match(/(\d+)\s*$/);
            if (pidMatch) {
              const pid = pidMatch[1];
              log(`Found backend python process PID ${pid}, killing...`);
              spawnSync('taskkill', ['/F', '/PID', pid, '/T'], { encoding: 'utf8' });
            }
          }
        }
      }
    } catch (e) {
      log(`Error finding python processes: ${e.message}`);
    }

    // Wait and resolve
    setTimeout(() => resolve(true), 2000);
  });
}

// Wait for backend to be ready
function waitForBackend(timeout = 30000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const check = () => {
      const req = require('http').request({
        host: BACKEND_HOST,
        port: BACKEND_PORT,
        path: '/health',
        method: 'GET',
        timeout: 2000
      }, (res) => {
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          retry();
        }
      });

      req.on('error', retry);
      req.on('timeout', retry);
      req.end();
    };

    const retry = () => {
      if (Date.now() - startTime > timeout) {
        reject(new Error('Backend startup timeout'));
      } else {
        setTimeout(check, 1000);
      }
    };

    check();
  });
}

// Map: import name -> pip package name (when different)
const moduleToPip = { 'jwt': 'PyJWT' };

// Check if required Python modules are installed
function checkPythonModules(pythonPath) {
  const requiredModules = ['fastapi', 'uvicorn', 'psutil', 'aiohttp', 'websockets', 'jwt', 'bcrypt', 'cryptography', 'pydantic', 'pydantic_settings', 'httpx', 'certifi'];
  const missing = [];

  for (const mod of requiredModules) {
    try {
      const result = spawnSync(pythonPath, ['-c', `import ${mod}`], {
        encoding: 'utf8',
        timeout: 10000,
        shell: true
      });
      if (result.status !== 0) {
        log(`Module ${mod} not found: ${result.stderr || 'import failed'}`);
        missing.push(mod);
      } else {
        log(`Module ${mod} OK`);
      }
    } catch (e) {
      log(`Error checking module ${mod}: ${e.message}`);
      missing.push(mod);
    }
  }

  return missing;
}

// Install Python dependencies
async function installDependencies(pythonPath, backendPath) {
  const requirementsPath = path.join(backendPath, 'requirements.txt');

  // First check if modules are already installed
  const missingModules = checkPythonModules(pythonPath);
  if (missingModules.length === 0) {
    log('All required Python modules are already installed');
    return true;
  }

  log(`Missing Python modules: ${missingModules.join(', ')}`);

  if (!fs.existsSync(requirementsPath)) {
    log('requirements.txt not found, trying to install missing modules directly...');
    // Install missing modules directly
    for (const mod of missingModules) {
      const pipName = moduleToPip[mod] || mod;
      log(`Installing ${pipName}...`);
      const result = spawnSync(pythonPath, ['-m', 'pip', 'install', pipName], {
        encoding: 'utf8',
        timeout: 120000,
        shell: true
      });
      if (result.status !== 0) {
        log(`Failed to install ${pipName}: ${result.stderr}`);
      } else {
        log(`Installed ${pipName} successfully`);
      }
    }
    return checkPythonModules(pythonPath).length === 0;
  }

  log('Installing Python dependencies from requirements.txt...');

  return new Promise((resolve) => {
    const pip = spawn(pythonPath, ['-m', 'pip', 'install', '-r', 'requirements.txt', '--no-warn-script-location'], {
      cwd: backendPath,
      encoding: 'utf8',
      shell: true
    });

    pip.stdout.on('data', (data) => {
      log(`[pip] ${data.toString().trim()}`);
    });

    pip.stderr.on('data', (data) => {
      log(`[pip] ${data.toString().trim()}`);
    });

    pip.on('close', (code) => {
      if (code === 0) {
        log('Dependencies installed successfully');
        resolve(true);
      } else {
        log(`pip install failed with code ${code}, trying individual modules...`);
        // Try installing missing modules individually
        const stillMissing = checkPythonModules(pythonPath);
        if (stillMissing.length > 0) {
          log(`Still missing: ${stillMissing.join(', ')}, installing individually...`);
          for (const mod of stillMissing) {
            const pipName = moduleToPip[mod] || mod;
            spawnSync(pythonPath, ['-m', 'pip', 'install', pipName], {
              encoding: 'utf8',
              timeout: 120000
            });
          }
        }
        resolve(checkPythonModules(pythonPath).length === 0);
      }
    });

    pip.on('error', (err) => {
      log(`pip install error: ${err.message}`);
      resolve(false);
    });
  });
}

// Start Python backend
async function startBackend() {
  const backendPath = getBackendPath();
  const mainPyPath = path.join(backendPath, 'main.py');
  const runServerPath = path.join(backendPath, 'run_server.py');

  log(`Backend path: ${backendPath}`);
  log(`Main.py path: ${mainPyPath}`);
  log(`Run server path: ${runServerPath}`);

  // Check if main.py exists
  if (!fs.existsSync(mainPyPath)) {
    const errorMsg = `Backend main.py not found at:\n${mainPyPath}`;
    log(errorMsg);
    dialog.showErrorBox('Backend Not Found', errorMsg);
    return false;
  }

  // Check if backend is already running and healthy
  const backendHealthy = await checkBackendHealth();
  if (backendHealthy) {
    log('Backend is already running and healthy');
    return true;
  }

  // ALWAYS try to kill any existing processes on the port before starting
  log('Cleaning up any existing processes on port...');
  await killProcessOnPort(BACKEND_PORT);

  // Wait for port cleanup
  await new Promise(r => setTimeout(r, 1000));

  // Check if port is now available
  const portAvailable = await checkPort(BACKEND_PORT);
  if (!portAvailable) {
    log('Port is still in use after cleanup attempt. Trying one more time...');

    // Try killing again
    await killProcessOnPort(BACKEND_PORT);
    await new Promise(r => setTimeout(r, 2000));

    // Check again
    const portAvailableRetry = await checkPort(BACKEND_PORT);
    if (!portAvailableRetry) {
      const errorMsg = `Port ${BACKEND_PORT} is still in use after multiple cleanup attempts.\n\nPlease manually close any application using this port and restart MonitorApp.`;
      log(errorMsg);
      dialog.showErrorBox('Port In Use', errorMsg);
      return false;
    }
  }

  log('Port is available, proceeding to start backend...');

  // Find Python
  const pythonPath = getPythonPath();
  if (!pythonPath) {
    const errorMsg = 'Python not found!\n\nPlease install Python 3.9 or later from:\nhttps://www.python.org/downloads/\n\nMake sure to check "Add Python to PATH" during installation.';
    log(errorMsg);
    dialog.showErrorBox('Python Not Found', errorMsg);
    return false;
  }

  log(`Using Python: ${pythonPath}`);

  // Check if using embedded Python (no need to install dependencies)
  const isEmbedded = pythonPath.includes('resources') || pythonPath.includes('python-embed');
  if (!isEmbedded) {
    // Only check dependencies for system Python
    log('Using system Python, checking dependencies...');
    const missingModules = checkPythonModules(pythonPath);
    if (missingModules.length > 0) {
      log(`Missing modules: ${missingModules.join(', ')}, attempting install...`);
      await installDependencies(pythonPath, backendPath);
      const stillMissing = checkPythonModules(pythonPath);
      if (stillMissing.length > 0) {
        const errorMsg = `Failed to install required Python modules:\n${stillMissing.join(', ')}\n\nPlease run manually:\npip install -r requirements.txt`;
        log(errorMsg);
        dialog.showErrorBox('Dependencies Missing', errorMsg);
        return false;
      }
    }
  } else {
    log('Using embedded Python with pre-installed dependencies');
  }

  return new Promise((resolve) => {
    log('Starting backend process...');
    log(`Python path: ${pythonPath}`);
    log(`Backend path: ${backendPath}`);

    // Use run_server.py for embedded Python (handles sys.path properly)
    // Use main.py for system Python (cwd is added to path automatically)
    const scriptToRun = isEmbedded && fs.existsSync(runServerPath) ? 'run_server.py' : 'main.py';
    log(`Using script: ${scriptToRun}`);

    // Use full path to script to avoid path issues with spaces
    const fullScriptPath = path.join(backendPath, scriptToRun);
    log(`Full script path: ${fullScriptPath}`);

    pythonProcess = spawn(pythonPath, ['-u', fullScriptPath], {
      cwd: backendPath,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        PYTHONPATH: backendPath
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
      // Note: shell: false (default) to properly handle paths with spaces
    });

    let startupError = '';

    pythonProcess.stdout.on('data', (data) => {
      const msg = data.toString().trim();
      log(`[Backend] ${msg}`);
    });

    pythonProcess.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      log(`[Backend Error] ${msg}`);
      startupError += msg + '\n';
    });

    pythonProcess.on('error', (err) => {
      const errorMsg = `Failed to start Python backend.\n\nError: ${err.message}\n\nPython path: ${pythonPath}`;
      log(errorMsg);
      dialog.showErrorBox('Backend Error', errorMsg);
      resolve(false);
    });

    pythonProcess.on('close', (code) => {
      log(`Backend process exited with code: ${code}`);

      if (!isQuitting && code !== 0) {
        let errorMsg = `Backend process stopped unexpectedly.\nExit code: ${code}`;

        if (startupError) {
          // Show only last few lines of error
          const errorLines = startupError.split('\n').slice(-10).join('\n');
          errorMsg += `\n\nError details:\n${errorLines}`;
        }

        errorMsg += '\n\nCheck if all Python dependencies are installed:\npip install -r requirements.txt';

        dialog.showErrorBox('Backend Stopped', errorMsg);
      }
      pythonProcess = null;
    });

    // Wait for backend to be ready
    waitForBackend()
      .then(() => {
        log('Backend is ready!');
        resolve(true);
      })
      .catch((err) => {
        log(`Backend startup failed: ${err.message}`);

        let errorMsg = 'Backend failed to start within timeout.\n\n';
        if (startupError) {
          const errorLines = startupError.split('\n').slice(-10).join('\n');
          errorMsg += `Error details:\n${errorLines}`;
        }

        dialog.showErrorBox('Backend Timeout', errorMsg);
        resolve(false);
      });
  });
}

// Stop Python backend
function stopBackend() {
  if (pythonProcess) {
    log('Stopping backend...');

    // On Windows, we need to kill the process tree
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', pythonProcess.pid, '/f', '/t']);
    } else {
      pythonProcess.kill('SIGTERM');
    }

    pythonProcess = null;
  }
}

// Create main window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'MonitorApp',
    icon: path.join(__dirname, '..', 'public', 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle close to tray
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Create system tray
function createTray() {
  const iconPath = path.join(__dirname, '..', 'public', 'icon.ico');

  let icon;
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
  } else {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('MonitorApp - Process Monitor');
  updateTrayMenu();

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function updateTrayMenu() {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'เปิดโปรแกรม',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Backend Status',
      enabled: false
    },
    {
      label: pythonProcess ? '● Running' : '○ Stopped',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Restart Backend',
      click: async () => {
        stopBackend();
        await startBackend();
        updateTrayMenu();
      }
    },
    {
      label: 'View Logs',
      click: () => {
        dialog.showMessageBox({
          type: 'info',
          title: 'Backend Logs',
          message: 'Recent Backend Logs',
          detail: backendLogs.slice(-20).join('\n') || 'No logs available',
          buttons: ['OK']
        });
      }
    },
    { type: 'separator' },
    {
      label: 'ออกจากโปรแกรม',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

// App lifecycle
app.whenReady().then(async () => {
  log('Starting MonitorApp...');
  log(`App path: ${app.getAppPath()}`);
  log(`Resources path: ${process.resourcesPath}`);
  log(`Is packaged: ${app.isPackaged}`);

  // Start backend first
  const backendStarted = await startBackend();

  if (!backendStarted) {
    const choice = dialog.showMessageBoxSync({
      type: 'warning',
      buttons: ['Continue Without Backend', 'Quit'],
      defaultId: 1,
      title: 'Backend Warning',
      message: 'Could not start the backend server.\n\nThe application may not function properly without the backend.',
    });

    if (choice === 1) {
      app.quit();
      return;
    }
  }

  // Create window and tray
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Keep running in tray on Windows
});

app.on('before-quit', () => {
  isQuitting = true;
  stopBackend();
});

app.on('quit', () => {
  stopBackend();
  if (tray) {
    tray.destroy();
  }
});

// IPC handlers
ipcMain.handle('get-backend-status', () => {
  return {
    running: pythonProcess !== null,
    port: BACKEND_PORT,
    logs: backendLogs.slice(-20)
  };
});

ipcMain.handle('restart-backend', async () => {
  stopBackend();
  const result = await startBackend();
  updateTrayMenu();
  return result;
});

ipcMain.handle('get-logs', () => {
  return backendLogs;
});
