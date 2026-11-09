@echo off
rem FH Match Centre server commands, e.g. "fh deploy v0.1.0", "fh status". See fh.mjs.
setlocal
if /i not "%~1"=="upgrade" (node "%~dp0fh.mjs" %* & exit /b)
rem Node.js can't be updated while it runs this, so `fh upgrade` runs from a copy of it.
for %%n in (node.exe) do set "FH_NODE=%%~$PATH:n"
if not defined FH_NODE (echo node.exe isn't on the PATH. & exit /b 1)
copy /y "%FH_NODE%" "%~dp0fh-node.exe" >nul || exit /b 1
"%~dp0fh-node.exe" "%~dp0fh.mjs" %* & exit /b
