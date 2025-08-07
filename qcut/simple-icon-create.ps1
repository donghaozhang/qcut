Add-Type -AssemblyName System.Drawing

# Load the PNG image
$pngPath = "C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\apps\web\public\logo.png"
$icoPath = "C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\build\icon.ico"

Write-Host "Creating Windows ICO file..."
Write-Host "Source PNG: $pngPath"
Write-Host "Output ICO: $icoPath"

try {
    # Load original PNG
    $originalImage = [System.Drawing.Image]::FromFile($pngPath)
    Write-Host "PNG loaded successfully: $($originalImage.Width)x$($originalImage.Height)"
    
    # Create high-quality 256x256 bitmap
    $bitmap = New-Object System.Drawing.Bitmap(256, 256)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    
    # Set maximum quality rendering
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    
    # Clear background and draw image
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.DrawImage($originalImage, 0, 0, 256, 256)
    $graphics.Dispose()
    
    # Convert to icon
    $iconHandle = $bitmap.GetHicon()
    $icon = [System.Drawing.Icon]::FromHandle($iconHandle)
    
    # Save the ICO file
    Write-Host "Saving ICO file..."
    $fileStream = [System.IO.File]::Create($icoPath)
    $icon.Save($fileStream)
    $fileStream.Close()
    
    # Also save to alternative locations
    $altPaths = @(
        "C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\icon.ico",
        "C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\apps\web\public\icon.ico",
        "C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\electron\icon.ico"
    )
    
    foreach ($altPath in $altPaths) {
        Copy-Item $icoPath $altPath -Force
        Write-Host "Copied to: $altPath"
    }
    
    # Clean up
    $icon.Dispose()
    $bitmap.Dispose()
    $originalImage.Dispose()
    
    # Get file size for verification
    $fileInfo = Get-Item $icoPath
    Write-Host "SUCCESS: ICO file created!"
    Write-Host "File size: $($fileInfo.Length) bytes"
    
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
}