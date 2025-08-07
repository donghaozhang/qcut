# Clear Windows Icon Cache
Write-Host "🔄 Clearing Windows Icon Cache..."

# Method 1: Clear icon cache database
$iconCachePath = "$env:LOCALAPPDATA\Microsoft\Windows\Explorer"
$iconCacheFiles = @(
    "iconcache_*.db",
    "thumbcache_*.db"
)

foreach ($pattern in $iconCacheFiles) {
    $files = Get-ChildItem -Path $iconCachePath -Filter $pattern -ErrorAction SilentlyContinue
    foreach ($file in $files) {
        try {
            Remove-Item -Path $file.FullName -Force -ErrorAction Stop
            Write-Host "✅ Deleted: $($file.Name)"
        } catch {
            Write-Host "❌ Could not delete: $($file.Name) (file in use)"
        }
    }
}

# Method 2: Restart Explorer to refresh icons
Write-Host "🔄 Restarting Explorer to refresh icons..."
try {
    Stop-Process -Name "explorer" -Force -ErrorAction Stop
    Start-Sleep -Seconds 2
    Start-Process "explorer.exe"
    Write-Host "✅ Explorer restarted successfully"
} catch {
    Write-Host "❌ Could not restart Explorer: $($_.Exception.Message)"
}

# Method 3: Clear specific file association cache
Write-Host "🔄 Clearing file association cache..."
try {
    Remove-ItemProperty -Path "HKCU:\SOFTWARE\Classes\Local Settings\Software\Microsoft\Windows\Shell\MuiCache" -Name "*QCut*" -ErrorAction SilentlyContinue
    Write-Host "✅ File association cache cleared"
} catch {
    Write-Host "ℹ️  File association cache: no entries found"
}

Write-Host "🎯 Icon cache clearing complete!"
Write-Host "📝 Note: You may need to refresh File Explorer (F5) to see changes"