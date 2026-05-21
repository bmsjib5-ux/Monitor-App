#!/usr/bin/env python
"""Launcher script for MonitorApp backend"""
import sys
import os

# Add backend directory to path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Now import and run main
if __name__ == "__main__":
    from main import app
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3001, log_level="info")
