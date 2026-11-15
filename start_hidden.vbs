' Hidden launcher for the CodeBuddy turn navigator injector.
' Registered under HKCU\Software\Microsoft\Windows\CurrentVersion\Run
' so it starts silently at logon. The injector itself waits for the IDE's
' debug port to appear, so it does not matter whether CodeBuddy is running yet.
Option Explicit

Dim fso, shell, base, scriptPath, nodeExe, cmd

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

base = fso.GetParentFolderName(WScript.ScriptFullName)
scriptPath = base & "\tocnav.mjs"

nodeExe = "C:\Program Files\nodejs\node.exe"
If Not fso.FileExists(nodeExe) Then nodeExe = "node.exe"

If Not fso.FileExists(scriptPath) Then WScript.Quit 1

shell.CurrentDirectory = base
cmd = """" & nodeExe & """ """ & scriptPath & """ 9333,9334,9335"
shell.Run cmd, 0, False
