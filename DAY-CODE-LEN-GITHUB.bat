@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo =========================================================
echo   DANG DAY CODE STUDIOFLOW LEN GITHUB CUA ANH...
echo   Neu cua so GitHub hien ra, anh bam "Sign in with your browser"
echo =========================================================
git remote remove origin 2>nul
git remote add origin https://github.com/nguyenthigiangpisv630-png/studioflow-youtube.git
git branch -M main
git push -u origin main
echo.
echo =========================================================
echo   HOAN TAT! Anh co the quay lai trang Render.com de Deploy!
echo =========================================================
pause
