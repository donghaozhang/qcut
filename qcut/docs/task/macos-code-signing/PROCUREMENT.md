# macOS Signing — Procurement Steps

This is the manual, out-of-code work the user does in Apple's web
console. Subtasks 1–4 of [`PLAN.md`](PLAN.md).

> **Order matters.** D-U-N-S blocks enrollment; enrollment blocks cert
> generation; cert blocks CI integration. **Start subtask 1 today.**

## 1. D-U-N-S Number

Apple requires every Organization-tier applicant to have a Dun &
Bradstreet **D-U-N-S Number** — a free 9-digit identifier that proves
the legal entity exists.

### Step 1.1 — Look up first (Quriosity may already have one)

1. Visit https://developer.apple.com/enroll/duns-lookup/.
2. Enter:
   - Legal entity name: **Quriosity Pty Ltd** (use the exact name on your ASIC company registration)
   - Country: **Australia**
   - Address: registered business address
3. Submit.

**If found:** note the 9-digit number, skip to subtask 2.

**If not found:** Apple's lookup page offers "Request a D-U-N-S Number" — proceed to step 1.2.

### Step 1.2 — Request a D-U-N-S Number (only if not found)

1. Click "Request a D-U-N-S Number" on the same page — this submits to Dun & Bradstreet for free issuance.
2. Provide:
   - Legal name (must match ASIC exactly)
   - ABN
   - Registered business address
   - Registered phone (this matters — see Gotchas below)
   - Primary contact email
   - Brief business activity description
3. Wait **5–14 business days** for D&B to verify and issue the number. D&B may email asking for clarification — respond promptly.

### Why D-U-N-S delay is the long pole

Many users hit "wait 2 weeks for D-U-N-S" and don't realise it until they try to enroll. **Submit this first**, even before reading the rest of this doc.

### Gotchas

- The phone number registered against the D-U-N-S is what Apple may call later. **Make sure it routes to a person who answers in business hours.**
- The legal name on D-U-N-S **must exactly match** the company name on ASIC and on Apple Developer enrollment. "Quriosity Pty Ltd" ≠ "Quriosity Pty. Ltd." — Apple rejects mismatches.
- D&B may reach out to verify. Reply within 24h to avoid restarting the queue.

## 2. Apple Developer Program enrollment

Once the D-U-N-S Number is in hand:

### Step 2.1 — Decide the Apple ID

Pick the Apple ID that will own the membership. Recommendations:

- **Use a shared org email**, not a personal one. e.g. `apple-dev@qcut.app` or `support@qcut.app`. Keeps continuity if any individual leaves the team.
- **Enable 2FA** with multiple trusted phones/devices. Apple absolutely refuses to remove 2FA from a developer account; losing all 2FA factors is a recovery nightmare.
- **Bookmark the recovery codes** in 1Password.

### Step 2.2 — Submit enrollment

1. Sign into https://developer.apple.com/programs/enroll/ with the chosen Apple ID.
2. Pick **Organization**.
3. Fill in:
   - Legal entity name (must exactly match D-U-N-S record)
   - D-U-N-S Number
   - Address, phone, country
   - Authorized signer information — must be a person legally authorized to bind the company (director, or someone with delegated authority)
4. Pay USD 99. Apple bills in your local currency — for AU, this is typically around AUD 149.99.
5. Wait for Apple verification.
   - Apple may call the phone number on the D-U-N-S record to confirm the authorized signer.
   - This usually happens within 1–2 business days but can take up to a week.
   - If Apple cannot reach the number, enrollment stalls until they do.

### Step 2.3 — Confirmation

You receive an email with subject like "Welcome to the Apple Developer Program". Sign into https://developer.apple.com/account and confirm "Apple Developer Program Membership" is listed.

## 3. Developer ID Application certificate

This is the cert that signs `.app` bundles distributed **outside the Mac App Store**. QCut needs **only this cert** — not "Developer ID Installer", "Mac App Distribution", or any of the other cert types listed in the Apple console.

### Step 3.1 — Generate the Certificate Signing Request (CSR) on your Mac

1. Open **Keychain Access** (Applications → Utilities → Keychain Access).
2. Menu: **Keychain Access → Certificate Assistant → Request a Certificate from a Certificate Authority…**.
3. Fields:
   - User Email: the org Apple ID (e.g. `apple-dev@qcut.app`)
   - Common Name: `Quriosity Apple Developer ID`
   - CA Email: leave blank
   - **Saved to disk:** select
   - **Let me specify key pair information:** select (RSA, 2048-bit)
4. Save the resulting `.certSigningRequest` file (e.g. to Desktop).

### Step 3.2 — Upload CSR and download the certificate

1. https://developer.apple.com/account → **Certificates, Identifiers & Profiles** → **Certificates** → **+**.
2. Pick **Developer ID Application**.
3. Upload the `.certSigningRequest` from step 3.1.
4. Download the resulting `.cer`.
5. **Double-click the `.cer`** — it imports into your Keychain. The certificate appears in the **login** keychain with the matching private key (because you generated the CSR locally).

### Step 3.3 — Export as `.p12` (for CI)

GitHub-hosted Mac runners do not have your keychain. They need the cert + private key as a base64-encoded `.p12`.

1. Open Keychain Access.
2. Find the new certificate. It is named like `Developer ID Application: Quriosity Pty Ltd (TEAMID)`. Open the disclosure triangle — you should see two rows: the certificate, and the matching private key as a child item.
3. **Select both rows** (cmd-click).
4. Right-click → **Export 2 items**.
5. Format: **Personal Information Exchange (.p12)**.
6. Save as `quriosity-developer-id.p12`.
7. Set a strong export password — this becomes the `MAC_CSC_KEY_PASSWORD` GitHub secret.

> ⚠️ Common mistake: exporting only the certificate row produces a `.p12` without the private key, which CI cannot use. Always select **both** the cert and the private key child row.

### Step 3.4 — Convert to base64 for CI

```bash
base64 -i quriosity-developer-id.p12 | pbcopy
```

The clipboard now contains the base64-encoded form. Paste this as the `MAC_CSC_LINK` GitHub secret.

### Step 3.5 — Backup

Store the original `.p12` and the export password in 1Password (or whatever the team's password manager is) under a "QCut release credentials" item.

If lost, the cert can be revoked and reissued — annoying but not catastrophic. A few hours to rebuild momentum.

## 4. App-Specific Password and Team ID

### Step 4.1 — App-Specific Password (for Notarization)

Apple's notarization service authenticates with your Apple ID + a separate "app-specific password" (you cannot use your real Apple ID password because of 2FA).

1. Sign into https://appleid.apple.com with the org Apple ID.
2. **Sign-In and Security** → **App-Specific Passwords** → **+**.
3. Label: `QCut release notarization`.
4. Generate. **Copy it once** — it is never shown again.
5. Store as GitHub secret `APPLE_APP_SPECIFIC_PASSWORD`.

### Step 4.2 — Team ID

A 10-character identifier for your Apple Developer team.

1. https://developer.apple.com/account → **Membership Details**.
2. Copy the 10-character "Team ID" (looks like `ABCDE12345`).
3. Store as GitHub variable (not secret) `APPLE_TEAM_ID` — it is not sensitive.

### Step 4.3 — Apple ID

The Apple ID you used for enrollment.

- Store as GitHub secret `APPLE_ID` (it is the email address — arguably could be a variable, but secret is safer to avoid feeding reconnaissance).

## 5. CLI shortcut path (optional, hybrid)

Sections 1–4 are the pure-GUI path. This section gives a **hybrid
path**: use the command line where it is faster, with the two
**unavoidable** web-UI steps called out separately. About 5 minutes
end-to-end for one-time setup.

### What CAN be done via CLI

| Step | Command |
|------|---------|
| Generate CSR | `openssl req -new …` (replaces Keychain Access dialog) |
| Combine `.cer + .key` into `.p12` | `openssl pkcs12 -export …` |
| Import into login keychain | `security import …` |
| Verify signing identity | `security find-identity -v -p codesigning` |
| base64 encode for CI | `base64 -i … \| pbcopy` |

### What CANNOT be done via CLI

1. **Submitting the CSR to Apple to get the `.cer`** — no public CLI.
   Options:
   - **Web UI** at developer.apple.com (3 minutes) — recommended for
     one-time setup.
   - **App Store Connect API** (`fastlane cert` or direct API calls)
     — but creating the API Key itself is a web-UI step, so you'd
     still click once. Only worth it for long-term automated cert
     rotation.
2. **App-Specific Password** — no API exists, must use
   account.apple.com. Workaround: use App Store Connect API Key for
   notarization instead (see "Future hardening"); that bypasses the
   app-specific password entirely.

### Full hybrid script

#### ① Generate CSR via CLI

```bash
cd ~/Desktop
openssl genrsa -out quriosity-developer-id.key 2048
openssl req -new -key quriosity-developer-id.key \
  -out quriosity-developer-id.csr \
  -subj "/emailAddress=apple-dev@qcut.app/CN=Quriosity Apple Developer ID/C=AU"
```

#### ② Web UI (~4 minutes)

- developer.apple.com → **Certificates** → **+** → **Developer ID
  Application** → upload the `.csr` → download the `.cer` (save as
  `developerID_application.cer`).
- account.apple.com → **Sign-In and Security** → **App-Specific
  Passwords** → generate `QCut release notarization`, copy it
  immediately.

#### ③ Bundle `.p12` and import via CLI

```bash
# Combine .cer + .key into .p12 (prompts for export password = MAC_CSC_KEY_PASSWORD)
openssl pkcs12 -export \
  -out quriosity-developer-id.p12 \
  -inkey quriosity-developer-id.key \
  -in developerID_application.cer \
  -name "Developer ID Application: Quriosity Pty Ltd (JQ3Q27U24X)"

# Import into login keychain so `bun run dist:mac` picks it up locally
security import quriosity-developer-id.p12 \
  -k ~/Library/Keychains/login.keychain-db \
  -P "$P12_PASSWORD" \
  -T /usr/bin/codesign

# Verify the identity is usable
security find-identity -v -p codesigning | grep "Developer ID Application"

# base64 encode for the GitHub Actions secret MAC_CSC_LINK
base64 -i quriosity-developer-id.p12 | pbcopy
```

> ⚠️ When generating the CSR with OpenSSL, the private-key file
> `quriosity-developer-id.key` **must be safeguarded** (1Password or
> an encrypted backup). Losing it means the certificate has to be
> revoked and reissued. The Keychain Access GUI path keeps the
> private key inside the login keychain by default — that is the one
> convenience advantage of the GUI path over CLI.

### When to use which path

| Scenario | Recommended path |
|----------|------------------|
| One-time first-time setup | **Hybrid** (this section, ~5 min) |
| Unfamiliar with Keychain Access | Hybrid (CLI is more direct than GUI flow) |
| Prefer not to touch the command line | Pure GUI (section 3) |
| Long-term automation (cert rotation in N years) | App Store Connect API + `fastlane cert` (see "Future hardening") |

## Summary: GitHub repo settings

After all four subtasks, the following must be configured in
**Settings → Secrets and variables → Actions**:

| Name | Type | Value |
|------|------|-------|
| `MAC_CSC_LINK` | secret | base64 of `quriosity-developer-id.p12` |
| `MAC_CSC_KEY_PASSWORD` | secret | the `.p12` export password from §3.3 |
| `APPLE_ID` | secret | the org Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | secret | from §4.1 |
| `APPLE_TEAM_ID` | variable | 10-char Team ID from §4.2 |

After this section is done, the engineering work in [`IMPLEMENTATION.md`](IMPLEMENTATION.md) can begin.

## Future hardening: App Store Connect API key

Long-term, replace `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` with an **App Store Connect API key** (`.p8` file + key ID + issuer ID). This:

- Decouples notarization from a specific Apple ID account.
- Survives team-member changes.
- Can be revoked independently.

Apple's docs: https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api

Track this as a follow-up issue, not part of v1.
