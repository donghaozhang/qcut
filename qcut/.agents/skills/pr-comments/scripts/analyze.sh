#!/bin/bash
# Analyze PR comment task files - group by source file
# Usage: ./analyze.sh tasks_dir
# Compatible with macOS (bash 3) and Linux (bash 4+)

set -e

TASKS_DIR=${1:-""}

if [ -z "$TASKS_DIR" ]; then
    echo "Usage: ./analyze.sh tasks_dir"
    echo "Example: ./analyze.sh docs/pr-comments/pr-102-tasks"
    exit 1
fi

if [ ! -d "$TASKS_DIR" ]; then
    echo "Error: Directory not found: $TASKS_DIR"
    exit 1
fi

echo "# PR Comments Analysis"
echo ""
echo "Tasks directory: $TASKS_DIR"
echo ""

# Build a temp file with "source_file line" pairs
TEMP_FILE=$(mktemp)
trap "rm -f $TEMP_FILE" EXIT

total=0
for task in "$TASKS_DIR"/*.md; do
    if [ -f "$task" ]; then
        # Extract file path and line number (no PCRE, works on macOS)
        source_file=$(sed -n 's/.*\*\*File:\*\* `\([^`]*\)`.*/\1/p' "$task" | head -1)
        line=$(sed -n 's/.*\*\*Line:\*\* \([0-9]*\).*/\1/p' "$task" | head -1)
        [ -z "$source_file" ] && source_file="unknown"
        [ -z "$line" ] && line="?"
        echo "$source_file $line" >> "$TEMP_FILE"
        total=$((total + 1))
    fi
done

unique_files=$(cut -d' ' -f1 "$TEMP_FILE" | sort -u | wc -l | tr -d ' ')

echo "## Summary"
echo "- Total comments: $total"
echo "- Unique files: $unique_files"
echo ""

echo "## By Source File (process in this order)"
echo ""
echo "| Source File | Lines (fix bottom-up) | Count |"
echo "|-------------|----------------------|-------|"

# Group by source file, sort lines descending within each group
cut -d' ' -f1 "$TEMP_FILE" | sort -u | while read -r source_file; do
    lines=$(grep "^${source_file} " "$TEMP_FILE" | cut -d' ' -f2 | sort -rn | tr '\n' ',' | sed 's/,$//')
    count=$(grep -c "^${source_file} " "$TEMP_FILE")
    echo "| \`$source_file\` | $lines | $count |"
done | sort -t'|' -k4 -rn

echo ""
echo "## Recommended Processing Order"
echo ""
echo "Fix each file's comments **bottom-up** (highest line number first)."
echo "This prevents line number shifts from affecting subsequent fixes."
