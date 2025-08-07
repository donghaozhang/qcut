# Open-Source Distribution Guide for QCut

## Overview
As an open-source project, QCut distributes unsigned binaries. This guide covers best practices for open-source software distribution and user education about security warnings.

## Why No Code Signing?

### Cost Considerations
- **EV Code Signing certificates cost $400-600/year**
- **Not sustainable for free open-source projects**
- **Community-driven projects prioritize development over certificates**

### Open-Source Alternative Approaches
1. **Clear documentation and transparency**
2. **Multiple download sources (GitHub, website)**
3. **Checksums and verification methods**
4. **Build from source instructions**
5. **Community trust and reputation**

## Distribution Strategy

### Primary Distribution Channels
1. **GitHub Releases** (primary)
   - Automatic builds via GitHub Actions
   - Source code always available
   - Release notes and changelogs
   - Community oversight

2. **Official Website**
   - Clear download instructions
   - Security warnings explanation
   - Build verification guide

3. **Package Managers** (future)
   - Windows: Chocolatey, Scoop, winget
   - macOS: Homebrew
   - Linux: AppImage, Flatpak, Snap

### Build Verification

#### SHA256 Checksums
Generate checksums for all releases:
```bash
# Windows
certutil -hashfile "QCut Video Editor Setup 0.1.0.exe" SHA256

# Linux/macOS  
sha256sum "QCut Video Editor Setup 0.1.0.exe"
```

#### Release Process
1. Build installer with `bun run dist:win:release`
2. Generate SHA256 checksum
3. Create GitHub release with:
   - Installer file
   - Checksum file
   - Release notes
   - Security notice

### User Education

#### Windows Security Warnings
Create clear documentation for users about expected warnings:

**Expected Windows Behaviors:**
- "Windows protected your PC" SmartScreen warning
- "Unknown publisher" in installer properties  
- Windows Defender may scan file (normal)
- Some antivirus software may flag (false positive)

**User Instructions:**
1. Click "More info" on SmartScreen warning
2. Click "Run anyway" if you trust the source
3. Always download from official sources only
4. Verify checksums when possible

#### Security Best Practices for Users
```markdown
## Safe Download Checklist
- ✅ Download only from official QCut GitHub releases
- ✅ Verify the file size matches release notes
- ✅ Check SHA256 checksum if provided
- ✅ Scan with your antivirus (expect false positives)
- ✅ Never download QCut from third-party sites

## Red Flags - DO NOT INSTALL
- ❌ Downloaded from unofficial website
- ❌ File size significantly different than expected
- ❌ No GitHub release or source code available
- ❌ Requests unusual permissions during install
```

## Technical Implementation

### Build Configuration
```json
{
  "build": {
    "win": {
      "forceCodeSigning": false,
      "verifyUpdateCodeSignature": false,
      "signAndEditExecutable": false
    }
  }
}
```

### Release Commands
```bash
# Development build
bun run dist:win:unsigned

# Official release build  
bun run dist:win:release

# Directory only (for testing)
bun run dist:dir
```

### Automated Builds
GitHub Actions workflow for releases:
```yaml
name: Build Release
on:
  push:
    tags: ['v*']

jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install dependencies
        run: npm install
      - name: Build application
        run: npm run dist:win:release
      - name: Generate checksums
        run: |
          certutil -hashfile "dist/*.exe" SHA256 > checksums.txt
      - name: Create release
        uses: actions/create-release@v1
        with:
          files: |
            dist/*.exe
            checksums.txt
```

## Alternative Security Measures

### Build Reproducibility
1. **Dockerfile for consistent builds**
2. **Lock dependency versions**
3. **Document build environment**
4. **Provide build scripts**

### Community Verification
1. **Open build process on GitHub**
2. **Community can build from source**
3. **Multiple people can verify releases**
4. **Issue tracking for security concerns**

### Transparency Measures
1. **All code public on GitHub**
2. **Build logs available in Actions**
3. **No hidden or obfuscated code**
4. **Clear license (MIT/GPL)**

## User Communication

### Download Page Content
```markdown
# Download QCut Video Editor

## ⚠️ Security Notice
QCut is an open-source project and releases are **not code signed**. 
This means Windows will show security warnings - this is normal and expected.

## Why the warnings?
- Code signing certificates cost $400+/year
- As a free open-source project, we prioritize development
- The software is safe - all code is public on GitHub

## Safe Download Steps
1. Download only from GitHub releases
2. Windows will show "Unknown publisher" - this is expected
3. Click "More info" then "Run anyway"
4. Verify checksum if you want extra security
```

### README Security Section
Add prominent security section to README:
```markdown
## 🔒 Security & Downloads

QCut releases are **unsigned** because we're an open-source project that doesn't purchase expensive code signing certificates. This is common for open-source software.

**Windows will show security warnings - this is normal!**

- ✅ Only download from [GitHub Releases](https://github.com/user/qcut/releases)
- ✅ All code is open-source and auditable
- ✅ You can build from source yourself
- ❌ Never download from third-party sites
```

## Future Considerations

### Community Code Signing
- **Sponsor-funded certificates**: If project grows large enough
- **Foundation signing**: Join established open-source foundations
- **Community certificates**: Some foundations provide signing services

### Alternative Distribution
- **Microsoft Store**: Free developer account, automatic signing
- **Package managers**: Many handle signing automatically
- **Portable versions**: No installation required, fewer warnings

## Current Status

**✅ Implemented:**
- Unsigned release builds configured
- Clear build commands
- Documentation prepared

**📋 Next Steps:**
1. Update website/README with security notices
2. Create release checklist with checksums
3. Set up automated GitHub Actions
4. Educate users about expected warnings

**💡 Philosophy:**
Open-source software should be free to distribute. Users who understand and trust open-source software expect and accept unsigned binaries. Clear communication and transparency are more valuable than expensive certificates for community projects.