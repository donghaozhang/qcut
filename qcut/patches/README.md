# Dependency patches

## app-builder-lib 26.8.1

`macCodeSign.js` generates a temporary keychain password, but its certificate
import helper passes the P12 password to `security set-key-partition-list`.
The macOS release runner rejected this with `SecKeychainUnlock` during
[v2026.09.06.1](https://github.com/Quriosity-agent/qcut/actions/runs/34027071891).

The patch passes the generated keychain password through to the partition-list
command. Each certificate still uses its own P12 password for `security import`.
Bun applies this version-specific patch through `patchedDependencies`.
The upstream report is [electron-builder #10167](https://github.com/electron-userland/electron-builder/issues/10167).

Before removing the patch during an electron-builder upgrade, verify that the
upstream implementation uses the correct password and run the keychain password
regression tests plus the signed macOS release and notarization checks.
