@echo off
cd /d "C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\electron\resources"
ffmpeg.exe -y -framerate 30 -i "C:\Users\zdhpe\AppData\Local\Temp\qcut-export\1754225857238\frames\frame-%%04d.png" -c:v libx264 -preset fast -crf 23 -t 5 -pix_fmt yuv420p -movflags +faststart "C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\docs\task\working-output.mp4"
echo Exit code: %ERRORLEVEL%
pause