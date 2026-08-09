# Publishing QCut as a Public Plugin

QCut is a skills-only plugin. It does not bundle an app reference, connector,
or remote MCP server.

## Public GitHub distribution

The repository-level marketplace is
`/.agents/plugins/marketplace.json`. It points to
`/qcut/plugins/qcut`, allowing Codex to discover the plugin from the public
repository root.

Install the versioned release:

```bash
codex plugin marketplace add Quriosity-agent/qcut --ref qcut-plugin-v1.2.0
codex plugin add qcut@qcut
```

For branch testing before a release tag is created, replace the ref with
the branch under review.

## Validate and package

Run from the QCut application directory:

```bash
node --test plugins/qcut/scripts/*.test.mjs
python3 "${CODEX_HOME:-$HOME/.codex}/skills/.system/plugin-creator/scripts/validate_plugin.py" plugins/qcut
node plugins/qcut/scripts/package-submission.mjs
```

The packager emits a skills-only ZIP under `.tmp/plugin-submission/`. It includes
the manifest, icon, helper runtime, legal notices, README, and both skills. It
excludes tests, submission notes, and repository-only files.

## OpenAI public Plugins Directory

Publishing to GitHub does not publish to the curated Plugins Directory. The
publisher must use the
[OpenAI plugin submission portal](https://platform.openai.com/apps-manage) and:

1. Submit as **Skills only**.
2. Select the verified **Quriosity Pty Ltd** developer identity.
3. Upload the generated ZIP.
4. Use the fields in [`submission/LISTING.md`](submission/LISTING.md).
5. Enter exactly the five positive and three negative cases in
   [`submission/TEST_CASES.md`](submission/TEST_CASES.md).
6. Add [`submission/RELEASE_NOTES.md`](submission/RELEASE_NOTES.md).
7. Submit for review, address scan findings, and publish after OpenAI approval.

OpenAI review is an external gate. A submitted draft is not public in the
Plugins Directory until it is approved and the publisher selects **Publish**.
