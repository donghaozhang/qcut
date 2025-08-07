Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

# Load the PNG image
$pngPath = "C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\apps\web\public\logo.png"
$icoPath = "C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\build\icon.ico"

Write-Host "🎨 Creating Windows-compatible ICO file..."
Write-Host "📂 Source PNG: $pngPath"
Write-Host "💾 Output ICO: $icoPath"

try {
    # Load original PNG
    $originalImage = [System.Drawing.Image]::FromFile($pngPath)
    Write-Host "✅ PNG loaded: $($originalImage.Width)x$($originalImage.Height)"
    
    # Windows ICO standard sizes
    $iconSizes = @(16, 20, 24, 32, 40, 48, 64, 96, 128, 256)
    $iconBitmaps = @()
    
    Write-Host "🔧 Creating multiple icon sizes..."
    
    foreach ($size in $iconSizes) {
        # Create high-quality bitmap for each size
        $bitmap = New-Object System.Drawing.Bitmap($size, $size)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        
        # Set maximum quality rendering
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        
        # Draw with white background for better compatibility
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.DrawImage($originalImage, 0, 0, $size, $size)
        $graphics.Dispose()
        
        $iconBitmaps += $bitmap
        Write-Host "  ✓ Created ${size}x${size} icon"
    }
    
    # Use the largest bitmap (256x256) to create the ICO
    $mainBitmap = $iconBitmaps[-1]
    
    # Convert to icon handle
    $iconHandle = $mainBitmap.GetHicon()
    $icon = [System.Drawing.Icon]::FromHandle($iconHandle)
    
    # Save the ICO file
    Write-Host "💾 Saving ICO file..."
    $fileStream = [System.IO.File]::Create($icoPath)
    $icon.Save($fileStream)
    $fileStream.Close()
    
    # Also save to alternative locations
    $alternativePaths = @(
        "C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\icon.ico",
        "C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\apps\web\public\icon.ico",
        "C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\electron\icon.ico"
    )
    
    foreach ($altPath in $alternativePaths) {
        Copy-Item $icoPath $altPath -Force
        Write-Host "  📋 Copied to: $altPath"
    }
    
    # Clean up
    $icon.Dispose()
    foreach ($bitmap in $iconBitmaps) {
        $bitmap.Dispose()
    }
    $originalImage.Dispose()
    
    # Get file size for verification
    $fileInfo = Get-Item $icoPath
    Write-Host "✅ ICO file created successfully!"
    Write-Host "📏 File size: $($fileInfo.Length) bytes"
    
    Write-Host "🎯 Icon creation complete!"
    
} catch {
    Write-Host "❌ Error creating ICO: $($_.Exception.Message)"
    Write-Host "Stack trace: $($_.Exception.StackTrace)"
}