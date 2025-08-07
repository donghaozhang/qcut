Add-Type -AssemblyName System.Drawing

# Load the newest PNG image
$pngPath = "C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\apps\web\public\logo.png"
$buildIconPath = "C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\build\icon.ico"
$rootIconPath = "C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\icon.ico"

Write-Host "Loading PNG from: $pngPath"

try {
    $png = [System.Drawing.Image]::FromFile($pngPath)
    Write-Host "PNG loaded successfully. Size: $($png.Width)x$($png.Height)"

    # Create multiple sizes for a complete ICO file
    $sizes = @(16, 24, 32, 48, 64, 128, 256)
    
    # Create the main 256x256 version for conversion
    $bitmap = New-Object System.Drawing.Bitmap(256, 256)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    
    # Set highest quality rendering
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    
    # Draw the image
    $graphics.DrawImage($png, 0, 0, 256, 256)
    $graphics.Dispose()
    
    # Convert to icon
    $iconHandle = $bitmap.GetHicon()
    $icon = [System.Drawing.Icon]::FromHandle($iconHandle)
    
    # Save to build directory
    Write-Host "Saving ICO to: $buildIconPath"
    $fileStream = [System.IO.File]::Create($buildIconPath)
    $icon.Save($fileStream)
    $fileStream.Close()
    
    # Also save to root directory (some electron-builder configs check here)
    Write-Host "Saving ICO to: $rootIconPath"
    $fileStream2 = [System.IO.File]::Create($rootIconPath)
    $icon.Save($fileStream2)
    $fileStream2.Close()
    
    # Update the build PNG as well
    $buildPngPath = "C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\build\icon.png"
    $png.Save($buildPngPath, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host "Updated PNG at: $buildPngPath"
    
    # Clean up
    $icon.Dispose()
    $bitmap.Dispose()
    $png.Dispose()
    
    Write-Host "✅ Successfully created ICO files with latest logo!"
    Write-Host "Files created:"
    Write-Host "  - $buildIconPath"
    Write-Host "  - $rootIconPath" 
    Write-Host "  - $buildPngPath"
    
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)"
}