"""
Setup script for building MonitorApp Backend as executable
Uses PyInstaller to create standalone executable
"""
from PyInstaller.__main__ import run
import os
import shutil

def clean_build():
    """Clean previous build artifacts"""
    dirs_to_clean = ['build', 'dist']
    for dir_name in dirs_to_clean:
        if os.path.exists(dir_name):
            print(f"Cleaning {dir_name}...")
            shutil.rmtree(dir_name)

    spec_file = 'backend/main.spec'
    if os.path.exists(spec_file):
        os.remove(spec_file)

def build_backend():
    """Build backend executable"""
    print("Building MonitorApp Backend...")

    options = [
        'backend/main.py',                    # Entry point
        '--name=MonitorApp-Backend',          # Executable name
        '--onefile',                          # Single file executable
        '--windowed',                         # No console window (use --console for debugging)
        '--icon=assets/icon.ico',             # App icon (if exists)
        '--add-data=backend/config.py;.',     # Include config
        '--add-data=backend/models.py;.',     # Include models
        '--add-data=backend/process_monitor.py;.',  # Include process_monitor
        '--add-data=backend/host_manager.py;.',     # Include host_manager
        '--hidden-import=fastapi',
        '--hidden-import=uvicorn',
        '--hidden-import=psutil',
        '--hidden-import=websockets',
        '--hidden-import=aiohttp',
        '--hidden-import=pydantic',
        '--hidden-import=pandas',
        '--hidden-import=openpyxl',
        '--collect-all=fastapi',
        '--collect-all=uvicorn',
        '--clean',
    ]

    run(options)
    print("Backend build completed!")

def build_agent():
    """Build agent executable"""
    print("Building MonitorApp Agent...")

    options = [
        'backend/agent.py',                   # Entry point
        '--name=MonitorApp-Agent',            # Executable name
        '--onefile',                          # Single file executable
        '--console',                          # Show console for agent
        '--icon=assets/icon.ico',             # App icon (if exists)
        '--hidden-import=aiohttp',
        '--hidden-import=psutil',
        '--clean',
    ]

    run(options)
    print("Agent build completed!")

if __name__ == "__main__":
    import sys

    print("="*60)
    print("MonitorApp - Build Script")
    print("="*60)
    print()

    # Check if PyInstaller is installed
    try:
        import PyInstaller
    except ImportError:
        print("ERROR: PyInstaller not found!")
        print("Please install it with: pip install pyinstaller")
        sys.exit(1)

    # Clean previous builds
    clean_build()

    # Build executables
    try:
        build_backend()
        print()
        build_agent()
        print()
        print("="*60)
        print("Build completed successfully!")
        print("="*60)
        print()
        print("Executables location:")
        print("  - Backend: dist/MonitorApp-Backend.exe")
        print("  - Agent:   dist/MonitorApp-Agent.exe")
        print()
    except Exception as e:
        print(f"ERROR during build: {e}")
        sys.exit(1)
