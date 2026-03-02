# Agent Browser - QCut Electron Automation

Control QCut's Electron app via Chrome DevTools Protocol using `agent-browser`.

## Setup

```bash
# Install (already done)
npm install -g agent-browser
agent-browser install
npx skills add vercel-labs/agent-browser --skill electron --agent claude-code --yes
```

## Launch QCut with Remote Debugging

```bash
# Built app
open -a "QCut AI Video Editor" --args --remote-debugging-port=9222

# Dev mode — add flag to electron:dev script or run manually
# TODO: add --remote-debugging-port=9222 to electron:dev
```

> If QCut is already running, quit it first. The flag must be present at launch time.

## Connect

```bash
agent-browser connect 9222

# Or pass --cdp per command
agent-browser --cdp 9222 snapshot -i

# Preserve dark mode (Playwright defaults to light)
agent-browser --color-scheme dark connect 9222
```

## Core Workflow

```bash
# 1. Snapshot — see all interactive elements with refs
agent-browser snapshot -i

# 2. Click an element by ref
agent-browser click @e5

# 3. Re-snapshot after state change
agent-browser snapshot -i
```

## Commands Reference

### Inspect & Find Elements

```bash
agent-browser snapshot -i                # Interactive elements with refs
agent-browser snapshot -i -c             # Compact (remove empty nodes)
agent-browser snapshot -i -d 3           # Limit tree depth
agent-browser snapshot --json            # Full tree as JSON
agent-browser get text @e5               # Get text content
agent-browser get html @e5               # Get HTML
agent-browser get value @e3              # Get input value
agent-browser find role button click     # Find by role
agent-browser find text "Export" click   # Find by text
agent-browser is visible @e5             # Check visibility
agent-browser is enabled @e5             # Check enabled state
agent-browser diff snapshot              # Compare current vs last snapshot
```

### Interact

```bash
agent-browser click @e5                  # Click
agent-browser dblclick @e5               # Double-click
agent-browser hover @e5                  # Hover
agent-browser fill @e3 "search query"    # Clear + fill input
agent-browser type @e3 "text"            # Type into element
agent-browser press Enter                # Press key
agent-browser press Control+a            # Key combo
agent-browser keyboard type "text"       # Type at current focus
agent-browser keyboard inserttext "text" # Insert without key events
agent-browser drag @e1 @e2               # Drag and drop
agent-browser scroll down 500            # Scroll
agent-browser select @e4 "option1"       # Select dropdown
agent-browser check @e6                  # Check checkbox
agent-browser upload @e7 ./file.mp4      # Upload file
agent-browser wait @e5                   # Wait for element
agent-browser wait 2000                  # Wait ms
```

### Console & JavaScript

```bash
agent-browser console                    # View console logs
agent-browser console --clear            # View and clear
agent-browser errors                     # View page errors
agent-browser errors --clear             # View and clear errors
agent-browser eval "document.title"      # Run arbitrary JS
agent-browser eval "window.electronAPI"  # Access Electron APIs
agent-browser eval "JSON.stringify(localStorage)"
```

### Screenshots & Recording

```bash
agent-browser screenshot qcut.png              # Screenshot
agent-browser screenshot --full full.png       # Full page
agent-browser screenshot --annotate labeled.png # With element labels
agent-browser pdf export.pdf                   # Save as PDF
agent-browser record start recording.webm      # Start video recording
agent-browser record stop                      # Stop recording
```

### Debugging & Profiling

```bash
agent-browser trace start                # Start Playwright trace
agent-browser trace stop trace.zip       # Stop and save
agent-browser profiler start             # Start Chrome profiler
agent-browser profiler stop profile.json # Stop and save
agent-browser highlight @e5              # Highlight element visually
```

### Network

```bash
agent-browser network requests                  # View tracked requests
agent-browser network requests --filter "api"   # Filter by pattern
agent-browser network route "*/api/*" --abort   # Block requests
agent-browser network route "*/api/*" --body '{"mock":true}' # Mock response
agent-browser network unroute                   # Remove all routes
```

### Storage

```bash
agent-browser cookies get                # List cookies
agent-browser cookies clear              # Clear cookies
agent-browser storage local              # View localStorage
agent-browser storage session            # View sessionStorage
```

### Tab / Window Management

```bash
agent-browser tab                        # List all windows/webviews
agent-browser tab 2                      # Switch to tab by index
agent-browser tab --url "*editor*"       # Switch by URL pattern
```

### Sessions (Multiple Apps)

```bash
agent-browser --session qcut connect 9222
agent-browser --session vscode connect 9223
agent-browser --session qcut snapshot -i
agent-browser --session vscode snapshot -i
```

## QCut-Specific Examples

### Inspect the Editor Timeline

```bash
agent-browser connect 9222
agent-browser snapshot -i -s "[data-testid='timeline']"  # Scope to timeline
agent-browser screenshot --annotate timeline.png
```

### Read Console Errors

```bash
agent-browser connect 9222
agent-browser errors
```

### Execute QCut Electron APIs

```bash
agent-browser eval "JSON.stringify(Object.keys(window.electronAPI))"
agent-browser eval "window.electronAPI.sounds.search('click')"
```

### Record a Workflow

```bash
agent-browser connect 9222
agent-browser record start workflow.webm
agent-browser click @e10    # Navigate
agent-browser fill @e3 "My Project"
agent-browser click @e15    # Create
agent-browser record stop
```

### Profile Performance

```bash
agent-browser connect 9222
agent-browser profiler start
# ... perform actions ...
agent-browser profiler stop qcut-profile.json
```

## Troubleshooting

| Issue | Fix |
|---|---|
| Connection refused | Quit QCut, relaunch with `--remote-debugging-port=9222` |
| Connect fails after launch | Add `sleep 3` before `connect` |
| Elements missing from snapshot | Use `agent-browser tab` to find the right webview |
| Can't type in custom inputs | Use `keyboard inserttext "text"` instead of `fill` |
| Dark mode lost | Use `--color-scheme dark` or `AGENT_BROWSER_COLOR_SCHEME=dark` |
| Port in use | Check with `lsof -i :9222` |
