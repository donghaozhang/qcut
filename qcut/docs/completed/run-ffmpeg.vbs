' FFmpeg Video Export Script
Dim objShell, strCommand, intReturn

Set objShell = CreateObject("WScript.Shell")

WScript.Echo "Starting FFmpeg export..."

strCommand = """C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\electron\resources\ffmpeg.exe"" -y -framerate 30 -i ""C:\Users\zdhpe\AppData\Local\Temp\qcut-export\1754225857238\frames\frame-%04d.png"" -c:v libx264 -preset fast -crf 23 -t 5 -pix_fmt yuv420p -movflags +faststart ""C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\docs\task\working-output-vbs.mp4"""

intReturn = objShell.Run(strCommand, 1, True)

If intReturn = 0 Then
    WScript.Echo "Success! Video created: " & "C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\docs\task\working-output-vbs.mp4"
Else
    WScript.Echo "FFmpeg failed with exit code: " & intReturn
End If

WScript.Echo "Press OK to continue"