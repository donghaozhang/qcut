Add-Type -AssemblyName System.Drawing

# Load the PNG image
$pngPath = "C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\apps\web\public\logo.png"
$icoPath = "C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\build\icon.ico"

$png = [System.Drawing.Image]::FromFile($pngPath)

# Create multiple sizes for a proper ICO file
$sizes = @(16, 32, 48, 64, 128, 256)
$bitmaps = @()

foreach ($size in $sizes) {
    $bitmap = New-Object System.Drawing.Bitmap($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    
    # Set high quality scaling
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    
    # Draw the image
    $graphics.DrawImage($png, 0, 0, $size, $size)
    $graphics.Dispose()
    
    $bitmaps += $bitmap
}

# Create the largest bitmap for icon conversion
$mainBitmap = $bitmaps[-1]  # 256x256
$iconHandle = $mainBitmap.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($iconHandle)

# Save the icon
$fileStream = [System.IO.File]::Create($icoPath)
$icon.Save($fileStream)
$fileStream.Close()

# Clean up
$icon.Dispose()
foreach ($bitmap in $bitmaps) {
    $bitmap.Dispose()
}
$png.Dispose()

Write-Host "Created multi-size ICO file at: $icoPath"

# Also copy to alternative location that electron-builder might check
$altPath = "C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\icon.ico"
Copy-Item $icoPath $altPath -Force
Write-Host "Also copied to: $altPath"