# QCut Plugin Privacy Notice

Effective date: July 23, 2026

This notice applies to the QCut plugin for ChatGPT and Codex published by
Quriosity Pty Ltd. It supplements the privacy terms of OpenAI, QCut, and any AI
provider that a user chooses to configure.

## What the plugin does

The plugin supplies local skills and helper scripts that let ChatGPT or Codex
find QCut, run its structured command-line interface, and control a running QCut
desktop editor. The plugin does not provide its own hosted service or remote MCP
server.

## Data handled by the plugin

The plugin may process local file paths, project metadata, prompts, transcripts,
and command results needed for the workflow requested by the user. This data is
handled on the user's computer by ChatGPT or Codex and QCut.

The setup helper contacts GitHub's public release API to check for official QCut
releases. It does not send project media to GitHub.

When a user explicitly runs an AI generation, analysis, or transcription
workflow, QCut may send prompts or selected media to the provider configured by
the user. That transfer is governed by the selected provider's terms and privacy
policy. The plugin requires confirmation before uploads or paid operations and
does not select or configure a provider account on the user's behalf.

## Storage and credentials

The plugin has no independent analytics, advertising, account database, or
telemetry service. It does not bundle credentials and instructs the agent not to
print, log, or write API keys into generated files. QCut settings and the user's
ChatGPT or Codex environment control any local configuration and retention.

## User control

Users choose which files and projects to operate on. The plugin requires
confirmation before destructive actions, publishing, uploads, paid generation,
or opening an installer download. Users can disable or uninstall the plugin at
any time through ChatGPT or Codex.

## Contact

For privacy questions, contact `info@quriosity.com.au`. Security issues should
be reported privately to `security@qcut.app` rather than posted publicly.

Source code and issue tracking are available at
<https://github.com/Quriosity-agent/qcut>.
