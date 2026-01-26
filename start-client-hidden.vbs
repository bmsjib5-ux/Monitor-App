' Start MonitorApp Client in background (no console window)
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) & "\backend"
WshShell.Run "python main.py", 0, False

' Open browser after 3 seconds
WScript.Sleep 3000
WshShell.Run "http://localhost:3001"
