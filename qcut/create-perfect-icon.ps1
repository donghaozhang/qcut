# Create the most comprehensive ICO file possible for Windows
Add-Type -AssemblyName System.Drawing

Write-Host "Creating Perfect ICO File for QCut..."
Write-Host "====================================="

$pngPath = "C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\apps\web\public\logo.png"
$icoPath = "C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\build\icon.ico"

# Common Windows icon sizes
$iconSizes = @(16, 20, 24, 32, 40, 48, 64, 72, 96, 128, 256)

Write-Host "Source PNG: $pngPath"
Write-Host "Output ICO: $icoPath"
Write-Host "Creating multi-resolution ICO with sizes: $($iconSizes -join ', ')"

try {
    # Load the original PNG
    $originalImage = [System.Drawing.Image]::FromFile($pngPath)
    Write-Host "Original image loaded: $($originalImage.Width)x$($originalImage.Height)"
    
    # Create a memory stream to build the ICO
    $iconStream = New-Object System.IO.MemoryStream
    
    # ICO header (6 bytes)
    # Reserved (2 bytes) = 0
    $iconStream.Write([byte[]]@(0, 0), 0, 2)
    # Type (2 bytes) = 1 for ICO
    $iconStream.Write([byte[]]@(1, 0), 0, 2)
    # Image count (2 bytes)
    $imageCount = $iconSizes.Count
    $iconStream.Write([System.BitConverter]::GetBytes([uint16]$imageCount), 0, 2)
    
    $imageDataList = @()
    $currentOffset = 6 + ($imageCount * 16) # Header + directory entries
    
    # Create directory entries and image data
    foreach ($size in $iconSizes) {
        Write-Host "Processing size: ${size}x${size}"
        
        # Create bitmap for this size
        $bitmap = New-Object System.Drawing.Bitmap($size, $size)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        
        # Highest quality settings
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        
        # Clear and draw
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.DrawImage($originalImage, 0, 0, $size, $size)
        $graphics.Dispose()
        
        # Convert to PNG bytes (better compression than BMP for ICO)
        $pngStream = New-Object System.IO.MemoryStream
        $bitmap.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
        $imageData = $pngStream.ToArray()
        $pngStream.Dispose()
        $bitmap.Dispose()
        
        # Directory entry (16 bytes)
        $width = if ($size -eq 256) { 0 } else { $size }  # 0 for 256px
        $height = if ($size -eq 256) { 0 } else { $size } # 0 for 256px
        
        $iconStream.Write([byte[]]@($width), 0, 1)      # Width
        $iconStream.Write([byte[]]@($height), 0, 1)     # Height
        $iconStream.Write([byte[]]@(0), 0, 1)           # Color palette (0 = no palette)
        $iconStream.Write([byte[]]@(0), 0, 1)           # Reserved
        $iconStream.Write([byte[]]@(1, 0), 0, 2)        # Color planes
        $iconStream.Write([byte[]]@(32, 0), 0, 2)       # Bits per pixel
        
        # Image data size
        $dataSize = $imageData.Length
        $iconStream.Write([System.BitConverter]::GetBytes([uint32]$dataSize), 0, 4)
        
        # Image data offset
        $iconStream.Write([System.BitConverter]::GetBytes([uint32]$currentOffset), 0, 4)
        
        # Store image data for later
        $imageDataList += ,@{
            Data = $imageData
            Offset = $currentOffset
        }
        
        $currentOffset += $dataSize
    }
    
    # Write all image data
    foreach ($imageInfo in $imageDataList) {
        $iconStream.Write($imageInfo.Data, 0, $imageInfo.Data.Length)
    }
    
    # Save to file
    $iconBytes = $iconStream.ToArray()
    [System.IO.File]::WriteAllBytes($icoPath, $iconBytes)
    $iconStream.Dispose()
    
    # Also copy to all locations
    $altPaths = @(
        "C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\icon.ico",
        "C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\apps\web\public\icon.ico",
        "C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\electron\icon.ico"
    )
    
    foreach ($altPath in $altPaths) {
        Copy-Item $icoPath $altPath -Force
        Write-Host "Copied to: $altPath"
    }
    
    $originalImage.Dispose()
    
    # Get file info
    $fileInfo = Get-Item $icoPath
    Write-Host ""
    Write-Host "SUCCESS: Perfect multi-resolution ICO created!"
    Write-Host "File size: $($fileInfo.Length) bytes"
    Write-Host "Resolutions: $($iconSizes -join ', ')"
    
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
    Write-Host $_.Exception.StackTrace
}