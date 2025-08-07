# Code Signing Setup Guide for QCut

## Overview
This guide covers setting up code signing for QCut Video Editor to ensure secure distribution and eliminate Windows security warnings.

## Certificate Requirements

### Windows Code Signing Certificate
You need an **Extended Validation (EV) Code Signing Certificate** from a trusted Certificate Authority:

**Recommended Providers:**
- **Sectigo (formerly Comodo)** - $474/year
- **DigiCert** - $474/year  
- **GlobalSign** - $599/year
- **SSL.com** - $399/year

**Certificate Types:**
1. **Standard Code Signing** - Shows publisher name, some Windows warnings
2. **EV Code Signing** - No warnings, immediate SmartScreen reputation (recommended)

## Setup Process

### Step 1: Obtain Certificate
1. Purchase EV Code Signing certificate from provider
2. Complete business verification process (can take 3-7 days)
3. Download certificate as `.p12` or `.pfx` file
4. Store certificate securely with strong password

### Step 2: Configure Environment Variables

Create a `.env` file in project root (add to `.gitignore`):
```env
# Code Signing Certificate
CSC_LINK=path/to/certificate.p12
CSC_KEY_PASSWORD=certificate_password

# For CI/CD (base64 encoded certificate)
CSC_LINK_BASE64=base64_encoded_certificate_content
CSC_KEY_PASSWORD=certificate_password

# Timestamp server (for certificate validation)
WIN_CSC_TIMESTAMP_URL=http://timestamp.sectigo.com
```

### Step 3: Update Build Configuration

The project is already configured with code signing support in `package.json`:

```json
{
  "build": {
    "win": {
      "forceCodeSigning": false,  // Set to true for production
      "verifyUpdateCodeSignature": false,  // Set to true for production
      "signAndEditExecutable": false  // Set to true for production
    },
    "afterSign": "scripts/notarize.js",
    "codeSigningConfig": {
      "certificateFile": "${CSC_LINK}",
      "certificatePassword": "${CSC_KEY_PASSWORD}",
      "timestampServer": "http://timestamp.sectigo.com"
    }
  }
}
```

## Build Commands

### Development (Unsigned)
```bash
bun run dist:win:unsigned
# Creates installer without code signing
```

### Production (Signed)
```bash
bun run dist:win:signed
# Requires CSC_LINK and CSC_KEY_PASSWORD environment variables
```

### CI/CD Production
```bash
bun run dist:win:production
# Production build with signing and no auto-publish
```

## Testing Code Signing

### Verify Certificate
```bash
# Check certificate details
signtool verify /pa "path/to/QCut Video Editor Setup.exe"

# Check timestamp
signtool verify /v /pa "path/to/QCut Video Editor Setup.exe"
```

### Test Installation
1. Run installer on clean Windows machine
2. Verify no Windows Defender warnings
3. Check Windows Apps list shows proper publisher
4. Verify certificate in executable properties

## Security Best Practices

### Certificate Security
- Store certificate file in secure location
- Use strong password protection
- Never commit certificate or password to version control
- Use environment variables or secure vault for CI/CD

### CI/CD Setup
```yaml
# GitHub Actions example
- name: Setup Code Signing
  run: |
    echo "${{ secrets.CSC_LINK_BASE64 }}" | base64 -d > cert.p12
    echo "CSC_LINK=$(pwd)/cert.p12" >> $GITHUB_ENV
    echo "CSC_KEY_PASSWORD=${{ secrets.CSC_KEY_PASSWORD }}" >> $GITHUB_ENV

- name: Build Signed Installer
  run: bun run dist:win:production
```

## Troubleshooting

### Common Issues

**"Certificate not found"**
- Verify CSC_LINK path is correct
- Check file permissions
- Ensure certificate file is not corrupted

**"Invalid password"**
- Verify CSC_KEY_PASSWORD is correct
- Check for special characters in password
- Test certificate manually with signtool

**"Timestamp server unavailable"**
- Try alternative timestamp servers:
  - `http://timestamp.sectigo.com`
  - `http://timestamp.digicert.com`
  - `http://timestamp.globalsign.com`

**Windows still shows warnings**
- EV certificates may need time to build reputation
- Test on different Windows versions
- Verify certificate is properly installed

### Alternative Timestamp Servers
```json
"timestampServer": "http://timestamp.sectigo.com"
"timestampServer": "http://timestamp.digicert.com" 
"timestampServer": "http://timestamp.globalsign.com"
"timestampServer": "http://time.certum.pl"
```

## Cost Breakdown

**Annual Costs:**
- EV Code Signing Certificate: $400-600/year
- Hardware Security Module (if required): $0-200/year
- Certificate management tools: $0-100/year

**One-time Setup:**
- Certificate acquisition: 3-7 business days
- Initial setup: 2-4 hours
- Testing and validation: 1-2 hours

## Future Enhancements

### Auto-Update Support
Once code signing is set up:
1. Enable `verifyUpdateCodeSignature: true`
2. Configure electron-updater
3. Set up update server with signed releases

### Multi-Platform Signing
- **macOS**: Apple Developer Certificate + notarization
- **Linux**: Package signing for distributions

## Status

**Current Configuration:**
- ✅ Code signing configuration ready
- ✅ Build scripts configured
- ✅ Notarization script created
- ⏳ Certificate acquisition required
- ⏳ Production signing testing needed

**Next Steps:**
1. Obtain EV Code Signing certificate
2. Configure environment variables  
3. Test signed builds
4. Enable code signing for production releases