# Apply icon to the built executable
param(
    [string]$ExePath = "d:\AI_play\AI_Code\build_opencut\win-unpacked\QCut Video Editor.exe",
    [string]$IconPath = "C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\build\icon.ico"
)

Write-Host "Applying icon to executable..."
Write-Host "Target EXE: $ExePath"
Write-Host "Icon file: $IconPath"

try {
    # Check if files exist
    if (-not (Test-Path $ExePath)) {
        Write-Host "ERROR: EXE file not found: $ExePath"
        exit 1
    }
    
    if (-not (Test-Path $IconPath)) {
        Write-Host "ERROR: Icon file not found: $IconPath"
        exit 1
    }
    
    # Create a backup
    $backupPath = "$ExePath.backup"
    if (Test-Path $backupPath) {
        Remove-Item $backupPath -Force
    }
    Copy-Item $ExePath $backupPath -Force
    Write-Host "Created backup: $backupPath"
    
    # Try using resource update APIs via P/Invoke
    $signature = @"
    [DllImport("kernel32.dll")]
    public static extern IntPtr BeginUpdateResource(string pFileName, bool bDeleteExistingResources);
    
    [DllImport("kernel32.dll")]
    public static extern bool UpdateResource(IntPtr hUpdate, IntPtr lpType, IntPtr lpName, ushort wLanguage, byte[] lpData, uint cbData);
    
    [DllImport("kernel32.dll")]
    public static extern bool EndUpdateResource(IntPtr hUpdate, bool fDiscard);
    
    public static IntPtr RT_ICON = new IntPtr(3);
    public static IntPtr RT_GROUP_ICON = new IntPtr(14);
"@
    
    Add-Type -MemberDefinition $signature -Name ResourceUpdater -Namespace Win32
    
    # Read the icon file
    $iconBytes = [System.IO.File]::ReadAllBytes($IconPath)
    Write-Host "Icon file size: $($iconBytes.Length) bytes"
    
    # Begin resource update
    $hUpdate = [Win32.ResourceUpdater]::BeginUpdateResource($ExePath, $false)
    if ($hUpdate -eq [IntPtr]::Zero) {
        Write-Host "ERROR: Failed to begin resource update"
        exit 1
    }
    
    Write-Host "Applying icon resources..."
    
    # Parse ICO file to extract individual icons and group header
    $reserved = [BitConverter]::ToUInt16($iconBytes, 0)
    $type = [BitConverter]::ToUInt16($iconBytes, 2)  
    $count = [BitConverter]::ToUInt16($iconBytes, 4)
    
    Write-Host "ICO file: $count icons"
    
    # Group icon header (6 bytes + 14 bytes per icon)
    $groupHeader = $iconBytes[0..5]
    $groupEntries = @()
    
    $currentOffset = 6
    for ($i = 0; $i -lt $count; $i++) {
        # Read directory entry (16 bytes)
        $width = $iconBytes[$currentOffset]
        $height = $iconBytes[$currentOffset + 1]
        $colorCount = $iconBytes[$currentOffset + 2]
        $reserved = $iconBytes[$currentOffset + 3]
        $planes = [BitConverter]::ToUInt16($iconBytes, $currentOffset + 4)
        $bitCount = [BitConverter]::ToUInt16($iconBytes, $currentOffset + 6)
        $imageSize = [BitConverter]::ToUInt32($iconBytes, $currentOffset + 8)
        $imageOffset = [BitConverter]::ToUInt32($iconBytes, $currentOffset + 12)
        
        # Extract the actual icon data
        $iconImageData = $iconBytes[$imageOffset..($imageOffset + $imageSize - 1)]
        
        # Update individual icon resource (RT_ICON)
        $iconId = $i + 1
        $result = [Win32.ResourceUpdater]::UpdateResource($hUpdate, [Win32.ResourceUpdater]::RT_ICON, [IntPtr]$iconId, 1033, $iconImageData, $iconImageData.Length)
        if ($result) {
            Write-Host "Updated icon resource $iconId (${width}x${height})"
        }
        
        # Create group icon entry (14 bytes)
        $groupEntry = @(
            $width,
            $height, 
            $colorCount,
            $reserved,
            [byte]($planes -band 0xFF),
            [byte](($planes -shr 8) -band 0xFF),
            [byte]($bitCount -band 0xFF),
            [byte](($bitCount -shr 8) -band 0xFF),
            [byte]($imageSize -band 0xFF),
            [byte](($imageSize -shr 8) -band 0xFF),
            [byte](($imageSize -shr 16) -band 0xFF),
            [byte](($imageSize -shr 24) -band 0xFF),
            [byte]($iconId -band 0xFF),
            [byte](($iconId -shr 8) -band 0xFF)
        )
        
        $groupEntries += $groupEntry
        $currentOffset += 16
    }
    
    # Build group icon resource data
    $groupIconData = $groupHeader + ($groupEntries | ForEach-Object { $_ })
    
    # Update group icon resource (RT_GROUP_ICON)
    $result = [Win32.ResourceUpdater]::UpdateResource($hUpdate, [Win32.ResourceUpdater]::RT_GROUP_ICON, [IntPtr]1, 1033, $groupIconData, $groupIconData.Length)
    if ($result) {
        Write-Host "Updated group icon resource"
    }
    
    # End resource update
    $result = [Win32.ResourceUpdater]::EndUpdateResource($hUpdate, $false)
    if ($result) {
        Write-Host "SUCCESS: Icon applied to executable!"
    } else {
        Write-Host "ERROR: Failed to finalize icon update"
    }
    
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
}