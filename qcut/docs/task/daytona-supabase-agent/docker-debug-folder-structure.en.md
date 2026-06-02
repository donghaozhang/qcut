# Docker_debug Folder Structure

## Summary

`docs/task/daytona-supabase-agent/Docker_debug/` is a local debug/export bundle, not part of the QCut application code. It appears to collect review exports for a "GenAI Working Group" video course package, then turns those Excel exports into a CSV and a browsable local HTML review page.

The folder is correctly ignored by git because it contains generated artifacts, review screenshots, spreadsheet exports, personal setup notes, and local source-path documentation.

## High-Level Contents

| Path | Type | Purpose |
| --- | --- | --- |
| `审评意见汇总-合集/` | Excel export collection | Contains 64 `.xlsx` review-summary files for multiple video episodes and versions. |
| `审评意见图片/` | Extracted screenshots | Contains 261 `.jpeg` frame screenshots extracted from embedded Excel media. |
| `审评意见汇总.csv` | Generated CSV | Consolidated review rows, with episode, video, timestamp, reviewer, comment, status, topic, image path, and source file. |
| `review-feedback-browser.html` | Generated local browser | Standalone review browser with embedded data and filters for reviewer, topic, episode, and completion status. |
| `build_review_site.py` | Generator script | Parses review Excel files, extracts embedded screenshots, writes the CSV, and builds the HTML browser. |
| `analyze_excel.py` | Analysis helper | Summarizes review Excel files, comment counts, completion counts, screenshot counts, and main reviewers. |
| `inspect_excel.py` | Inspection helper | Dumps sample worksheet rows to understand the structure of the Excel exports. |
| `PERIPHERALS_SETUP.md` | Personal setup note | English Mac peripherals setup and troubleshooting notes. |
| `外设连接说明.md` | Personal setup note | Chinese version of the Mac peripherals setup and troubleshooting notes. |
| `FFAS-4.8-docs/FFAS-4.8-structure.md` | Source media inventory | Documents the original local `FFAS-4.8` media folder structure and missing episodes. |

## File Counts

The local folder currently contains 334 files:

| Extension | Count | Meaning |
| --- | ---: | --- |
| `.jpeg` | 261 | Extracted review-frame screenshots. |
| `.xlsx` | 64 | Review-summary spreadsheets. |
| `.py` | 3 | One-off parsing, analysis, and inspection scripts. |
| `.md` | 3 | Notes and source media structure documentation. |
| `.html` | 1 | Generated review browser. |
| `.csv` | 1 | Generated consolidated review data. |
| `.DS_Store` | 1 | macOS metadata. |

The folder size is about 23 MB.

## Data Flow

```text
Review Excel exports
  -> build_review_site.py
  -> extracted JPEG screenshots
  -> consolidated CSV
  -> standalone HTML review browser
```

The scripts assume the Excel files are in `审评意见汇总-合集/`. `build_review_site.py` reads embedded images from the Excel package internals, maps images to review rows, copies them into `审评意见图片/`, generates `审评意见汇总.csv`, and embeds the resulting review records into `review-feedback-browser.html`.

## Why It Should Stay Ignored

This folder should not be committed because it is a local artifact bundle rather than reusable application source. It includes generated screenshots, generated CSV/HTML output, exported review spreadsheets, reviewer/comment data, personal hardware notes, and absolute local paths. Keeping only a tracked structure note is safer and keeps the repository focused.
