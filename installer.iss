; MonitorApp Installer Script for Inno Setup
; Download Inno Setup from: https://jrsoftware.org/isinfo.php

#define MyAppName "MonitorApp"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "BMS Hospital"
#define MyAppURL "http://localhost:3001"
#define MyAppExeName "start-client.bat"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=installer-output
OutputBaseFilename=MonitorApp-Setup-{#MyAppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64
DisableProgramGroupPage=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "autostart"; Description: "Run at Windows startup (recommended for Client Mode)"; GroupDescription: "Startup Options:"

[Files]
; Backend files
Source: "backend\*"; DestDir: "{app}\backend"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "__pycache__,*.pyc,.env.local,*.log,logs\*"
; Frontend dist
Source: "frontend\dist\*"; DestDir: "{app}\frontend\dist"; Flags: ignoreversion recursesubdirs createallsubdirs
; Scripts
Source: "start-client.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "start-client-hidden.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "README-DEPLOY.md"; DestDir: "{app}"; Flags: ignoreversion; DestName: "README.txt"

[Dirs]
Name: "{app}\backend\data"; Permissions: users-modify

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Comment: "Start MonitorApp"
Name: "{group}\{#MyAppName} (Background)"; Filename: "{app}\start-client-hidden.vbs"; WorkingDir: "{app}"; Comment: "Start MonitorApp in background"
Name: "{group}\Open Dashboard"; Filename: "http://localhost:3001"; Comment: "Open MonitorApp in browser"
Name: "{group}\README"; Filename: "{app}\README.txt"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
; Install Python dependencies after installation
Filename: "cmd.exe"; Parameters: "/c pip install -r ""{app}\backend\requirements.txt"""; StatusMsg: "Installing Python dependencies..."; Flags: runhidden waituntilterminated
; Option to run after install
Filename: "{app}\{#MyAppExeName}"; Description: "Start MonitorApp now"; WorkingDir: "{app}"; Flags: nowait postinstall skipifsilent shellexec

[Registry]
; Add to startup if autostart task selected
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "MonitorApp"; ValueData: "wscript.exe ""{app}\start-client-hidden.vbs"""; Flags: uninsdeletevalue; Tasks: autostart

[UninstallRun]
; Stop any running instances before uninstall
Filename: "taskkill"; Parameters: "/F /IM python.exe"; Flags: runhidden; RunOnceId: "KillPython"

[UninstallDelete]
Type: filesandordirs; Name: "{app}\backend\data"
Type: filesandordirs; Name: "{app}\backend\__pycache__"

[Code]
var
  PythonPage: TInputOptionWizardPage;
  PythonInstalled: Boolean;

function IsPythonInstalled: Boolean;
var
  ResultCode: Integer;
begin
  Result := Exec('cmd.exe', '/c python --version', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);
end;

function InitializeSetup: Boolean;
var
  ResultCode: Integer;
begin
  Result := True;
  PythonInstalled := IsPythonInstalled;

  if not PythonInstalled then
  begin
    if MsgBox('Python is not installed on this computer.' + #13#10 + #13#10 +
              'Python 3.10 or higher is required to run MonitorApp.' + #13#10 + #13#10 +
              'Do you want to download Python now?' + #13#10 +
              '(Click Yes to open download page, then run this installer again)',
              mbConfirmation, MB_YESNO) = IDYES then
    begin
      ShellExec('open', 'https://www.python.org/downloads/', '', '', SW_SHOWNORMAL, ewNoWait, ResultCode);
      Result := False;
    end
    else
    begin
      MsgBox('Warning: MonitorApp will not work without Python.' + #13#10 +
             'Please install Python 3.10+ before running the application.',
             mbInformation, MB_OK);
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    // Create data directory
    ForceDirectories(ExpandConstant('{app}\backend\data'));
  end;
end;

function NeedRestart: Boolean;
begin
  Result := False;
end;
