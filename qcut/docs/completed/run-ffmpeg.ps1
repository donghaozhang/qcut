# FFmpeg Video Export Script
$ffmpegPath = "C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\electron\resources\ffmpeg.exe"
$framesDir = "C:\Users\zdhpe\AppData\Local\Temp\qcut-export\1754225857238\frames"
$outputFile = "C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\docs\task\working-output-ps.mp4"

Write-Host "Starting FFmpeg export..." -ForegroundColor Green

& $ffmpegPath -y -framerate 30 -i "$framesDir\frame-%04d.png" -c:v libx264 -preset fast -crf 23 -t 5 -pix_fmt yuv420p -movflags +faststart $outputFile

if ($LASTEXITCODE -eq 0) {
    Write-Host "Success! Video created: $outputFile" -ForegroundColor Green
    $fileInfo = Get-Item $outputFile
    Write-Host "File size: $([math]::Round($fileInfo.Length / 1KB, 2)) KB" -ForegroundColor Cyan
} else {
    Write-Host "FFmpeg failed with exit code: $LASTEXITCODE" -ForegroundColor Red
}

Read-Host "Press Enter to continue"