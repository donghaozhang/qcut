# Create Issue & Branch

Create a GitHub issue, a matching Linear issue, and a branch.

## Steps

1. Ask the user for: issue title and description (optional).
2. Check for existing duplicates: search GitHub (`gh issue list -S "<title keywords>"`) and Linear (`linear issue list --all-states`) for similar issues. If a potential duplicate is found, confirm with the user before proceeding.
3. Create a GitHub issue using `gh issue create` with the title and description.
4. Get the GitHub issue number (e.g. `#215`).
5. Create a matching Linear issue using `linear issue create` with:
   - `--title` and `--description` (or `--description-file` for multiline)
   - `--priority urgent`
   - `--status "In Progress"`
   - `--project QCut`
   - `--label <label>` — pick the best label(s) based on the issue content
   - Include the GitHub issue link in the description
6. Get the Linear issue identifier (e.g. `QUR-215`).
7. Update the GitHub issue body to include `Part of QUR-XXX` using `gh issue edit`.
8. Create a new git branch from the current branch: `<username>/qur-XXX-short-description` (kebab-case, lowercase).
9. Push the branch to remote with `git push -u origin <branch>`.
10. Report: GitHub issue URL, Linear issue URL, and branch name.

## Label Selection

Pick the most relevant label(s) from the issue content. Available labels:

| Label | Use when |
|-------|----------|
| Bug | Defect, broken behavior, regression |
| Feature | New capability or functionality |
| Improvement | Enhancement to existing feature |
| Performance | Speed, memory, optimization |
| UX | Design, usability, user experience |
| Infrastructure | CI/CD, build, tooling, devops |
| Documentation | Docs, READMEs, guides |
| Security | Auth vulnerabilities, data safety |
| AI/Pipeline | AICP, ViMax, video generation, AI agents |
| Electron | Main process, IPC, preload, packaging |
| Editor | Timeline, panels, playback, media UI |

Apply multiple labels when appropriate (e.g. a bug in the editor = Bug + Editor).

## Linear Auto-Linking

Linear automatically links when it sees magic words in commits, PR titles, or PR descriptions:

- `Part of QUR-XX` — incremental work
- `Fixes QUR-XX` / `Closes QUR-XX` — fully resolves

## Rules

- GitHub issue is created first, Linear second
- Branch names must be kebab-case and include the Linear issue ID
- Do not create duplicate issues — check existing issues first
- Priority is always **urgent**, status is always **In Progress**
- Always assign to project **QCut**
