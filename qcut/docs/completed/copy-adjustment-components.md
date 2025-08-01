# Copy Adjustment Components Script

*Integration script for AI image editing components*

## Quick Copy Commands

### Windows (PowerShell/CMD)
```powershell
# Navigate to project root
cd C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut

# Phase 1: Create directories
mkdir apps\web\src\components\editor\adjustment

# Phase 2: Copy adjustment components
copy "docs\completed\reference-version\apps\web\src\components\editor\adjustment\edit-history.tsx" "apps\web\src\components\editor\adjustment\"
copy "docs\completed\reference-version\apps\web\src\components\editor\adjustment\image-uploader.tsx" "apps\web\src\components\editor\adjustment\"
copy "docs\completed\reference-version\apps\web\src\components\editor\adjustment\model-selector.tsx" "apps\web\src\components\editor\adjustment\"
copy "docs\completed\reference-version\apps\web\src\components\editor\adjustment\parameter-controls.tsx" "apps\web\src\components\editor\adjustment\"
copy "docs\completed\reference-version\apps\web\src\components\editor\adjustment\preview-panel.tsx" "apps\web\src\components\editor\adjustment\"

# Phase 3: Copy store
copy "docs\completed\reference-version\apps\web\src\stores\adjustment-store.ts" "apps\web\src\stores\"

# Phase 4: Copy utilities
copy "docs\completed\reference-version\apps\web\src\lib\image-edit-client.ts" "apps\web\src\lib\"
copy "docs\completed\reference-version\apps\web\src\lib\image-utils.ts" "apps\web\src\lib\"
```

### Unix/Linux/Mac
```bash
# Navigate to project root
cd /path/to/qcut

# Phase 1: Create directories
mkdir -p apps/web/src/components/editor/adjustment

# Phase 2: Copy adjustment components
cp docs/completed/reference-version/apps/web/src/components/editor/adjustment/* \
   apps/web/src/components/editor/adjustment/

# Phase 3: Copy store
cp docs/completed/reference-version/apps/web/src/stores/adjustment-store.ts \
   apps/web/src/stores/

# Phase 4: Copy utilities
cp docs/completed/reference-version/apps/web/src/lib/image-edit-client.ts \
   apps/web/src/lib/
cp docs/completed/reference-version/apps/web/src/lib/image-utils.ts \
   apps/web/src/lib/
```

## Automated PowerShell Script

```powershell
# copy-adjustment-components.ps1
param(
    [string]$ProjectRoot = "C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut"
)

Write-Host "🚀 Starting Adjustment Components Integration..." -ForegroundColor Green

# Change to project directory
Set-Location $ProjectRoot

# Phase 1: Create directories
Write-Host "📁 Creating directories..." -ForegroundColor Blue
$adjustmentDir = "apps\web\src\components\editor\adjustment"
if (!(Test-Path $adjustmentDir)) {
    New-Item -ItemType Directory -Path $adjustmentDir -Force
    Write-Host "✅ Created: $adjustmentDir" -ForegroundColor Green
} else {
    Write-Host "ℹ️  Directory already exists: $adjustmentDir" -ForegroundColor Yellow
}

# Phase 2: Copy components
Write-Host "📋 Copying adjustment components..." -ForegroundColor Blue
$components = @(
    "edit-history.tsx",
    "image-uploader.tsx", 
    "model-selector.tsx",
    "parameter-controls.tsx",
    "preview-panel.tsx"
)

$sourceBase = "docs\completed\reference-version\apps\web\src\components\editor\adjustment"
$targetBase = "apps\web\src\components\editor\adjustment"

foreach ($component in $components) {
    $source = Join-Path $sourceBase $component
    $target = Join-Path $targetBase $component
    
    if (Test-Path $source) {
        Copy-Item $source $target -Force
        Write-Host "✅ Copied: $component" -ForegroundColor Green
    } else {
        Write-Host "❌ Missing: $source" -ForegroundColor Red
    }
}

# Phase 3: Copy store
Write-Host "🗄️  Copying adjustment store..." -ForegroundColor Blue
$storeSource = "docs\completed\reference-version\apps\web\src\stores\adjustment-store.ts"
$storeTarget = "apps\web\src\stores\adjustment-store.ts"

if (Test-Path $storeSource) {
    Copy-Item $storeSource $storeTarget -Force
    Write-Host "✅ Copied: adjustment-store.ts" -ForegroundColor Green
} else {
    Write-Host "❌ Missing: $storeSource" -ForegroundColor Red
}

# Phase 4: Copy utilities
Write-Host "🔧 Copying utility files..." -ForegroundColor Blue
$utilities = @(
    "image-edit-client.ts",
    "image-utils.ts"
)

$utilSourceBase = "docs\completed\reference-version\apps\web\src\lib"
$utilTargetBase = "apps\web\src\lib"

foreach ($util in $utilities) {
    $source = Join-Path $utilSourceBase $util
    $target = Join-Path $utilTargetBase $util
    
    if (Test-Path $source) {
        Copy-Item $source $target -Force
        Write-Host "✅ Copied: $util" -ForegroundColor Green
    } else {
        Write-Host "❌ Missing: $source" -ForegroundColor Red
    }
}

Write-Host "🎉 Integration complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Run 'bun dev' to test the integration"
Write-Host "2. Add adjustment tab to media panel"
Write-Host "3. Configure AI API keys if needed"
Write-Host "4. Test component functionality"
```

## Batch Script (Windows)

```batch
@echo off
echo 🚀 Starting Adjustment Components Integration...

cd /d "C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut"

echo 📁 Creating directories...
if not exist "apps\web\src\components\editor\adjustment" (
    mkdir "apps\web\src\components\editor\adjustment"
    echo ✅ Created adjustment directory
)

echo 📋 Copying adjustment components...
copy "docs\completed\reference-version\apps\web\src\components\editor\adjustment\edit-history.tsx" "apps\web\src\components\editor\adjustment\" >nul 2>&1 && echo ✅ Copied edit-history.tsx || echo ❌ Failed to copy edit-history.tsx
copy "docs\completed\reference-version\apps\web\src\components\editor\adjustment\image-uploader.tsx" "apps\web\src\components\editor\adjustment\" >nul 2>&1 && echo ✅ Copied image-uploader.tsx || echo ❌ Failed to copy image-uploader.tsx
copy "docs\completed\reference-version\apps\web\src\components\editor\adjustment\model-selector.tsx" "apps\web\src\components\editor\adjustment\" >nul 2>&1 && echo ✅ Copied model-selector.tsx || echo ❌ Failed to copy model-selector.tsx
copy "docs\completed\reference-version\apps\web\src\components\editor\adjustment\parameter-controls.tsx" "apps\web\src\components\editor\adjustment\" >nul 2>&1 && echo ✅ Copied parameter-controls.tsx || echo ❌ Failed to copy parameter-controls.tsx
copy "docs\completed\reference-version\apps\web\src\components\editor\adjustment\preview-panel.tsx" "apps\web\src\components\editor\adjustment\" >nul 2>&1 && echo ✅ Copied preview-panel.tsx || echo ❌ Failed to copy preview-panel.tsx

echo 🗄️ Copying adjustment store...
copy "docs\completed\reference-version\apps\web\src\stores\adjustment-store.ts" "apps\web\src\stores\" >nul 2>&1 && echo ✅ Copied adjustment-store.ts || echo ❌ Failed to copy adjustment-store.ts

echo 🔧 Copying utility files...
copy "docs\completed\reference-version\apps\web\src\lib\image-edit-client.ts" "apps\web\src\lib\" >nul 2>&1 && echo ✅ Copied image-edit-client.ts || echo ❌ Failed to copy image-edit-client.ts
copy "docs\completed\reference-version\apps\web\src\lib\image-utils.ts" "apps\web\src\lib\" >nul 2>&1 && echo ✅ Copied image-utils.ts || echo ❌ Failed to copy image-utils.ts

echo.
echo 🎉 Integration complete!
echo.
echo Next steps:
echo 1. Run 'bun dev' to test the integration
echo 2. Add adjustment tab to media panel
echo 3. Configure AI API keys if needed  
echo 4. Test component functionality
pause
```

## Verification Commands

After running the copy script, verify the integration:

```powershell
# Check if all files were copied
Get-ChildItem "apps\web\src\components\editor\adjustment" | Select-Object Name
Get-ChildItem "apps\web\src\stores\adjustment-store.ts" | Select-Object Name
Get-ChildItem "apps\web\src\lib\image-edit-client.ts" | Select-Object Name
Get-ChildItem "apps\web\src\lib\image-utils.ts" | Select-Object Name

# Test the build
bun run build

# Run development server
bun dev
```

## File Checklist

After copying, verify these files exist:

**Components** (5 files):
- ✅ `apps/web/src/components/editor/adjustment/edit-history.tsx`
- ✅ `apps/web/src/components/editor/adjustment/image-uploader.tsx`
- ✅ `apps/web/src/components/editor/adjustment/model-selector.tsx`
- ✅ `apps/web/src/components/editor/adjustment/parameter-controls.tsx`
- ✅ `apps/web/src/components/editor/adjustment/preview-panel.tsx`

**Store** (1 file):
- ✅ `apps/web/src/stores/adjustment-store.ts`

**Utilities** (2 files):
- ✅ `apps/web/src/lib/image-edit-client.ts`
- ✅ `apps/web/src/lib/image-utils.ts`

**Total**: 8 files copied for complete AI image editing functionality

## Usage

1. **Quick Copy**: Use the command line snippets above
2. **Automated**: Save PowerShell script as `copy-adjustment-components.ps1` and run
3. **Batch**: Save batch script as `copy-adjustment-components.bat` and double-click
4. **Manual**: Copy files one by one using file explorer

All scripts handle error checking and provide feedback on copy status.