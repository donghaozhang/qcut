# Code Signing Certificate Options

## TL;DR

**Recommended: [Certum SimplySign Standard Code Signing](https://shop.certum.eu/standard-code-signing-in-cloud.html) — Organization tier, ~USD 200/year (€189/year).**

Eligibility for QCut/Quriosity:
- ✅ Available in Australia
- ✅ No company-age requirement
- ✅ Cloud-based (no USB token)
- ⚠️ Each signing operation requires phone approval via SimplySign mobile app — semi-manual, not full CI automation. See [IMPLEMENTATION.md §architecture](IMPLEMENTATION.md#architecture-decision-where-signing-happens).

If full CI automation matters more than the **~$220/year cost difference**: **Alternative: SSL.com eSigner OV — ~USD 439–479/year ($239 cert + $200–240/year eSigner subscription), REST API, fully automated.**

> **Pricing reality (verified 2026-04-25 by viewing SSL.com checkout):** SSL.com is a **dual-cost** product, not a single price. The cert itself is $239/year, but cloud signing requires a separate `eSigner` subscription (Tier 1: $20/mo or $200/year for 20 signings/month). Many secondhand sources only quote the cert price and miss the eSigner fee — earlier drafts of this document made the same mistake.

## Why every other option was ruled out

### ❌ Azure Trusted Signing (Microsoft Artifact Signing)

Two **independent** blockers:

1. **Country eligibility.** Microsoft's official FAQ (Jan 2026): *"For Public Trust certificates, Artifact Signing is currently available to organizations in the USA, Canada, the European Union, and the United Kingdom."* Australia is not listed.
2. **Organization age.** Microsoft requires *"at least three years of verifiable history."* Quriosity registered 2024-06-10; will not qualify until 2027-06-10.

Microsoft Q&A confirms there is no exception process. Source: [Microsoft Artifact Signing FAQ](https://learn.microsoft.com/en-us/azure/artifact-signing/faq).

### ❌ SignPath Foundation (free for OSS)

Requires the project to remain open-source under an OSI-approved license. QCut may close-source in the future. SignPath Foundation eligibility cannot be carried over to a closed-source project.

### ❌ SSL.com EV / DigiCert EV

Pre-2024, EV certificates granted instant SmartScreen reputation — an EV-signed binary would show no warning even on first download. **Microsoft removed this in 2024** when they updated the Trusted Root Program requirements.

As of 2026, OV and EV certificates are **functionally identical** for SmartScreen purposes — both must build reputation organically through download volume. The 2× price premium for EV is no longer justified.

Source: [Reputation with OV certificates and are EV certificates still the better option? — Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/417016/reputation-with-ov-certificates-and-are-ev-certifi).

### ❌ Sectigo / DigiCert OV via traditional reseller (~$170–230/yr)

Cheap on paper but most still require a USB hardware token. Hardware tokens cannot be plugged into GitHub-hosted Windows runners, and the operational cost of shipping/managing a token to a self-hosted runner outweighs the certificate savings.

The cloud-based exceptions (DigiCert KeyLocker, SSL.com eSigner) are priced at $400+ for OV, well above Certum.

## Industry comparison (April 2026)

| Vendor | Cost (USD/yr) | CI automation | OSS-eligible | AU eligible | < 3yr eligible | Notes |
|--------|---------------|----------------|--------------|-------------|----------------|-------|
| **Certum SimplySign Standard** | **~$200** | ⚠️ Phone approval | ✅ ✅ | ✅ | ✅ | **Recommended for QCut.** Used by Inkdrop and many indie Electron projects. |
| **SSL.com eSigner OV** | **~$439–479** ($239 cert + $200–240 eSigner sub) | ✅ Full REST API | ✅ ✅ | ✅ | ✅ | Full CI automation, but **~2× Certum's price**. Dual-cost structure (cert + mandatory eSigner subscription) is not obvious until checkout. |
| SSL.com eSigner EV | ~$590–740 ($350–500 cert + $200–240 eSigner sub) | ✅ | ✅ ✅ | ✅ | ✅ | EV no longer worth premium since 2024. |
| Sectigo OV (resellers) | $170–230 | ⚠️ USB token | ✅ ✅ | ✅ | ✅ | Hostile to GitHub-hosted CI. |
| DigiCert OV/EV | $400–800 | ⚠️ USB / KSP | ✅ ✅ | ✅ | ✅ | Expensive, not justified. |
| Azure Artifact Signing | $120 | ✅ | N/A | ❌ | ❌ | **Not available to Quriosity.** |
| SignPath Foundation | $0 | ✅ | OSS-only | ✅ | ✅ | **Locks project to open-source.** |

## What signing actually changes (vs. doesn't)

Honest disclosure — signing does and doesn't fix specific things. Don't be misled by vendor marketing.

### ✅ Immediate changes (the day you sign)

- **UAC dialog**: yellow "Unknown publisher" → blue "Verified publisher: Quriosity Pty Ltd"
- **Enterprise IT policies** that block unsigned executables now allow QCut
- **Antivirus false-positive rate** drops significantly (Kaspersky, 360, Huorong, Avast, Defender heuristics)
- **Browser download warnings** reduced
- **winget / Chocolatey / scoop** package managers will accept QCut
- **Auto-update integrity**: `electron-updater` can verify each update chains to the same publisher

### 📈 Gradual changes (over hundreds–thousands of installs)

- **SmartScreen "Windows protected your PC"** warning becomes less frequent, eventually disappears
- Reputation accumulates per file hash AND (slowly) per publisher

### ❌ Does NOT change

- **Mark of the Web (MOTW)**: Windows still tags downloaded files. This is browser-side, not signature-side. Users may still see "Open File - Security Warning" dialogs.
- **First few hundred installs may still trigger SmartScreen** — but with verified publisher name shown ("Quriosity Pty Ltd"), conversion improves significantly.
- **User trust in unknown brands**: signing proves identity, not reputation. New companies still feel new.

## SmartScreen reputation reality (2026)

**Critical disclosure:** SmartScreen reputation is **per file hash**, not per certificate or per publisher. Each new build (v2026.5.0 → v2026.6.0) starts with zero reputation regardless of past releases.

What this means in practice:

- The very first user who downloads QCut v2026.6.0 will see a SmartScreen warning **even after we sign**.
- Reputation builds as more users install and don't report problems.
- After ~hundreds–thousands of installs without negative signals, the warning stops.
- Frequent versioning resets reputation — release cadence affects this.

### Mitigation strategies

- Don't release for every minor change — batch fixes into versioned drops.
- Encourage users to keep downloads in their cache (re-running same hash builds reputation).
- Long-term established publishers do get less aggressive scanning, even on new hashes.
- Add a Windows-download-page note explaining the warning is expected for new versions.

## Pricing trends (2026 industry context)

- **Effective March 2026:** CA/Browser Forum reduced max code-signing cert validity from 39 months to **460 days (~15 months)**. All issued certs from that date forward are bound to this limit. Renewal cadence is now annual, not multi-year.
- **EV certificates lost their unique SmartScreen instant-reputation benefit in 2024.** OV and EV now behave identically for SmartScreen.
- **Azure Trusted Signing eligibility was tightened in 2025** — narrowed to USA/Canada (with 3-year history), then expanded slightly to EU/UK. Australia and other geographies remain excluded as of 2026-Q1.
- **Cloud-HSM signing** (no USB token) is now the indie default. Certum SimplySign, SSL.com eSigner, DigiCert KeyLocker all support this.

## Certum SimplySign: how to apply

1. **Order the cert** at https://shop.certum.eu/standard-code-signing-in-cloud.html.
   - Type: Standard Code Signing **in Cloud** (NOT the USB version)
   - Term: 1 year (max under 2026 CA/B rules)
   - Validation: **Organization** (cert subject = "Quriosity Pty Ltd")
2. **Provide identity documents** — Certum will email a list. Typical:
   - Quriosity ASIC company registration (you have this)
   - D-U-N-S Number 893394655 (significantly speeds up validation)
   - Authorized Representative identity documents (government photo ID + recent proof-of-address utility bill or bank statement)
   - Registered business address proof (lease agreement or recent utility bill issued to Quriosity Pty Ltd at its registered place of business)
3. **Identity verification.** Certum reviews documents (3–7 business days, faster with D-U-N-S already done).
4. **Activate SimplySign account.** Certum emails activation link → installs SimplySign mobile app on Donghao's phone → desktop signing tool on his Mac/Windows machine.
5. **Issued certificate** lives in Certum's cloud HSM. Each `signtool sign` operation prompts Donghao's phone for approval.

Implementation against this credential setup is in [`IMPLEMENTATION.md`](IMPLEMENTATION.md).

## Renewal

- **Annual** (15-month cap by CA/B Forum).
- Set a calendar reminder 60 days before cert expiry.
- Renewal does NOT preserve SmartScreen reputation (it's per file hash anyway, and renewing doesn't change builds you've already shipped — those keep their reputation).

## Future migration paths

If Certum's manual phone approval becomes a bottleneck:
- **SSL.com eSigner OV** (~$220+/year more — see comparison table for actual dual-cost structure) — fully automated CI signing via REST API. Worth it only at high release frequency (>1×/week); below that, the manual phone-approval cost is ~minutes/year and not worth $220.
- **Wait for Azure eligibility** in 2027-06 (Quriosity hits 3 years) — may also depend on Microsoft expanding country list to AU. If both clear, $120/year + full CI automation makes Azure a clear winner.
- **Move to EV later** if SmartScreen reputation never converges (unlikely now, since EV no longer instant).
