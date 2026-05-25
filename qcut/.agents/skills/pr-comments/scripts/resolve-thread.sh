#!/bin/bash
# Resolve a PR review thread on GitHub and move task to completed
# Usage: ./resolve-thread.sh owner/repo pr_number comment_id [task_file]

set -e

REPO=${1:-""}
PR=${2:-""}
COMMENT_ID=${3:-""}
TASK_FILE=${4:-""}

if [ -z "$REPO" ] || [ -z "$PR" ] || [ -z "$COMMENT_ID" ]; then
    echo "Usage: ./resolve-thread.sh owner/repo pr_number comment_id [task_file]"
    echo "Example: ./resolve-thread.sh donghaozhang/qcut 102 2742327370 docs/pr-comments/pr-102-tasks/comment.md"
    exit 1
fi

OWNER=$(echo "$REPO" | cut -d'/' -f1)
REPO_NAME=$(echo "$REPO" | cut -d'/' -f2)

echo "Finding thread for comment $COMMENT_ID in $REPO PR #$PR..."

thread_has_comment() {
    local thread_id="$1"
    local comments_after=""

    while true; do
        local args=(
            -f threadId="$thread_id"
            -f query='query($threadId: ID!, $after: String) {
              node(id: $threadId) {
                ... on PullRequestReviewThread {
                  comments(first: 100, after: $after) {
                    nodes {
                      databaseId
                    }
                    pageInfo {
                      hasNextPage
                      endCursor
                    }
                  }
                }
              }
            }'
        )
        if [ -n "$comments_after" ]; then
            args+=(-f after="$comments_after")
        fi

        local response
        response=$(gh api graphql "${args[@]}" 2>/dev/null)

        if echo "$response" | jq -e --argjson comment_id "$COMMENT_ID" '.data.node.comments.nodes[]? | select(.databaseId == $comment_id)' >/dev/null; then
            return 0
        fi

        local has_next
        has_next=$(echo "$response" | jq -r '.data.node.comments.pageInfo.hasNextPage')
        if [ "$has_next" != "true" ]; then
            return 1
        fi

        comments_after=$(echo "$response" | jq -r '.data.node.comments.pageInfo.endCursor // ""')
        if [ -z "$comments_after" ]; then
            return 1
        fi
    done
}

THREAD_ID=""
THREADS_AFTER=""

while true; do
    args=(
        -f owner="$OWNER"
        -f name="$REPO_NAME"
        -F pr="$PR"
        -f query='query($owner: String!, $name: String!, $pr: Int!, $after: String) {
          repository(owner: $owner, name: $name) {
            pullRequest(number: $pr) {
              reviewThreads(first: 100, after: $after) {
                nodes {
                  id
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          }
        }'
    )
    if [ -n "$THREADS_AFTER" ]; then
        args+=(-f after="$THREADS_AFTER")
    fi

    THREADS_RESPONSE=$(gh api graphql "${args[@]}" 2>/dev/null)

    while IFS= read -r candidate_thread_id; do
        if [ -n "$candidate_thread_id" ] && thread_has_comment "$candidate_thread_id"; then
            THREAD_ID="$candidate_thread_id"
            break
        fi
    done < <(echo "$THREADS_RESPONSE" | jq -r '.data.repository.pullRequest.reviewThreads.nodes[].id')

    if [ -n "$THREAD_ID" ]; then
        break
    fi

    HAS_NEXT_THREADS=$(echo "$THREADS_RESPONSE" | jq -r '.data.repository.pullRequest.reviewThreads.pageInfo.hasNextPage')
    if [ "$HAS_NEXT_THREADS" != "true" ]; then
        break
    fi

    THREADS_AFTER=$(echo "$THREADS_RESPONSE" | jq -r '.data.repository.pullRequest.reviewThreads.pageInfo.endCursor // ""')
    if [ -z "$THREADS_AFTER" ]; then
        break
    fi
done

if [ -z "$THREAD_ID" ]; then
    echo "Error: Could not find thread for comment $COMMENT_ID"
    exit 1
fi

echo "Found thread: $THREAD_ID"

# Check if already resolved
IS_RESOLVED=$(gh api graphql -f threadId="$THREAD_ID" -f query='query($threadId: ID!) {
  node(id: $threadId) {
    ... on PullRequestReviewThread {
      isResolved
    }
  }
}' --jq ".data.node.isResolved" 2>/dev/null)

if [ "$IS_RESOLVED" = "true" ]; then
    echo "✓ Thread is already resolved"
else
    # Resolve the thread
    echo "Resolving thread..."
    RESULT=$(gh api graphql -f query="mutation {
      resolveReviewThread(input: {threadId: \"$THREAD_ID\"}) {
        thread {
          id
          isResolved
        }
      }
    }" 2>/dev/null)

    RESOLVED=$(echo "$RESULT" | jq -r '.data.resolveReviewThread.thread.isResolved')

    if [ "$RESOLVED" = "true" ]; then
        echo "✓ Thread resolved successfully"
    else
        echo "Error: Failed to resolve thread"
        echo "$RESULT" | jq .
        exit 1
    fi
fi

# Move task file to completed folder if provided
if [ -n "$TASK_FILE" ] && [ -f "$TASK_FILE" ]; then
    TASK_DIR=$(dirname "$TASK_FILE")
    COMPLETED_DIR="${TASK_DIR}_completed"
    FILENAME=$(basename "$TASK_FILE")

    mkdir -p -- "$COMPLETED_DIR"
    mv -- "$TASK_FILE" "$COMPLETED_DIR/$FILENAME"

    echo "✓ Task moved to: $COMPLETED_DIR/$FILENAME"
elif [ -n "$TASK_FILE" ]; then
    echo "Warning: Task file not found: $TASK_FILE"
fi

echo ""
echo "Done!"
