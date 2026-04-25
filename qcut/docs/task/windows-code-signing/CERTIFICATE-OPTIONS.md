# Code Signing Certificate Options

This is the "license" the user flagged. Authenticode signing requires a
commercial certificate; self-signed will not satisfy SmartScreen.

## TL;DR recommendation

**Azure Trusted Signing — Public Trust identity.** ~USD 10/month. Best fit
for a CI-driven Electron release pipeline. Issue #289 already proposes
this path.

## Comparison

| Vendor / Product | Cost (USD/yr) | SmartScreen warmup | CI-friendly? | Validation type | Notes |
|------------------|---------------|--------------------|--------------|-----------------|-------|
| **Azure Trusted Signing** (Public Trust) | ~$120 ($10/mo) | Standard (builds over time) | ✅ Native via `azureSignOptions` | Org or individual | **Recommended.** Cloud-resident keys, no HSM, MSFT-issued. |
| **Azure Trusted Signing** (Private Trust) | ~$120 | N/A (internal only) | ✅ | Org | Not useful — Private Trust is for line-of-business apps inside one tenant. |
| **DigiCert OV** | $400–600 | Slow (weeks–months) | ⚠️ Token shipping or KSP | Org | Traditional. OV = Organization Validation. |
| **DigiCert EV** | $600–800 | **Instant** SmartScreen reputation | ⚠️ Hardware token / cloud HSM only | Strict org vetting | Best UX, hardest CI integration. EV keys must live in FIPS HSM. |
| **Sectigo OV** | $200–400 | Slow | ⚠️ Token / KSP | Org | Cheaper OV option. |
| **Sectigo EV** | $400–600 | Instant | ⚠️ HSM | Strict | Cheaper EV option. |
| **SSL.com EV (eSigner)** | $300–500 | Instant | ✅ Cloud HSM via REST API | Strict | Good middle ground if EV reputation is required. |
| **GlobalSign OV/EV** | $250–700 | Slow / Instant | ⚠️ / ✅ | Org / Strict | Comparable to DigiCert. |
| **Self-signed** | $0 | Never trusted | ✅ | None | **Does not solve the issue.** Listed only to rule it out. |

## Why Azure Trusted Signing wins for QCut

1. **No hardware token** — Hardware tokens cannot be plugged into a
   GitHub-hosted Windows runner. Either you ship the token to a self-hosted
   runner (operational burden) or use a cloud HSM. Trusted Signing is cloud
   HSM by default.
2. **`electron-builder` first-class support** — `azureSignOptions` is
   documented and tested.
3. **Lower price floor** — $10/mo is significantly less than the $400+/yr
   DigiCert/Sectigo OV options, and dramatically less than EV.
4. **Microsoft-issued** — signed by a Microsoft root, so the publisher
   string in SmartScreen is shown without third-party CA chain quirks.
5. **Aligned with the issue** — issue #289 proposes this exact path; we
   stay aligned with the reporter's mental model.

## When to upgrade to EV later

EV gives **instant** SmartScreen reputation. Worth the upgrade if:

- Initial Trusted Signing builds still trigger "less common app" warnings
  beyond ~1,000 cumulative downloads, *and*
- Those warnings demonstrably hurt install conversion (track via download
  → first-launch telemetry, if available).

If we go EV later, **SSL.com eSigner** is the recommended provider because
it exposes a cloud-signing REST API that can replace `azureSignOptions`
without requiring a self-hosted runner with a USB token.

## Procurement steps (Azure Trusted Signing)

This is the manual, out-of-code work needed before any of the engineering
subtasks can be merged.

1. Sign in to the [Azure portal](https://portal.azure.com) with the
   Quriosity org account that will own the cert.
2. Create a **Trusted Signing Account** resource in a region that supports
   it (East US, West Central US, etc.).
3. Create a **Certificate Profile** of type **Public Trust → Public Trust
   Identity Validation** for an organization, or **Public Trust Individual
   Validation** for a personal cert.
4. Submit identity documents to Microsoft for validation. **This step takes
   1–7 days.** Plan accordingly.
5. Once validated, note the values needed by `electron-builder`:
   - **Endpoint** — e.g. `https://eus.codesigning.azure.net/`
   - **Code Signing Account Name** — the Trusted Signing Account resource name.
   - **Certificate Profile Name** — the profile created in step 3.
   - **Publisher Name** — exact subject CN that will appear in
     `Get-AuthenticodeSignature`. Must match an Azure-issued cert subject.
6. Create a **service principal** scoped to the Trusted Signing resource
   with the `Trusted Signing Certificate Profile Signer` role. Capture:
   - `AZURE_TENANT_ID`
   - `AZURE_CLIENT_ID`
   - `AZURE_CLIENT_SECRET` (or use OIDC federation — preferred long-term,
     see below)

## Long-term: prefer OIDC federation over client secret

For lower long-term maintenance, configure a **federated credential** on
the service principal so GitHub Actions authenticates via OIDC and no
`AZURE_CLIENT_SECRET` ever touches a GitHub secret. This is a follow-up
hardening task once the basic flow works — track in
[`IMPLEMENTATION.md §6`](IMPLEMENTATION.md#6-future-hardening).

## Renewal

Trusted Signing certificate profiles auto-rotate certificates; no annual
renewal task. The **Trusted Signing Account itself** is billed monthly as
a regular Azure resource — set a billing alert in the Azure subscription.
