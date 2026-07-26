# QCut Public Listing

## Info

- **Submission type:** Skills only
- **Plugin name:** QCut
- **Package name:** `qcut`
- **Version:** `1.1.0`
- **Developer identity:** Quriosity Pty Ltd
- **Category:** Creativity
- **Short description:** Create and edit video in QCut
- **Website:** <https://quriosity.com.au/>
- **Support:** <https://github.com/Quriosity-agent/qcut/issues>
- **Privacy:** <https://github.com/Quriosity-agent/qcut/blob/qcut-plugin-v1.1.0/qcut/plugins/qcut/PRIVACY.md>
- **Terms:** <https://github.com/Quriosity-agent/qcut/blob/qcut-plugin-v1.1.0/qcut/plugins/qcut/TERMS.md>

## Long Description

Use QCut's structured CLI to generate and analyze media, transcribe footage,
edit timelines, and export projects from a running QCut desktop app. The plugin
checks whether QCut is installed, directs users only to official releases, and
opens projects on the Media page. It prefers semantic CLI operations and verifies
project state after edits. For controls without a semantic command, it can show
an Agent pointer inside QCut and interact in the background without taking focus
from the user's active app. It understands QCut's advanced speed curves,
including Montage, Hero moment, Bullet time, custom control-point editing, and
the resulting clip-duration change. It can also record repeatable QCut demos
with minimum-resolution, duration, frame, and audio verification.

QCut is free and open source. The plugin is skills-only, runs locally, bundles no
credentials, and has no remote MCP server. AI generation and transcription use
providers configured by the user in QCut and may incur provider charges.

## Capabilities

- Generate media
- Transcribe footage
- Edit QCut timelines
- Adjust video speed curves
- Control the background Agent pointer
- Record verified HD demos
- Export video

## Starter Prompts

1. Check whether QCut is installed and open my project on the Media page.
2. Use QCut to transcribe this video and prepare an editable timeline.
3. Inspect my QCut timeline and make the requested edits, then verify them.
4. Keep my current app focused while the Agent pointer applies and adjusts a
   Montage speed curve in QCut.

## Availability

Select all countries supported by OpenAI where QCut's open-source desktop
application and English-language support are available, subject to applicable
law.
