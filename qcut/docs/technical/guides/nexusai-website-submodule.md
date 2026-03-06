# NexusAI Website Submodule

QCut vendors `nexusai-website` as a git submodule at `qcut/packages/nexusai-website` in the superproject
(`qcut/` folder in this workspace).

## Initialize after clone

```bash
# Run from /Users/peter/Desktop/code/qcut
git submodule update --init --recursive
```

## Update this submodule to latest remote commit

```bash
# Run from /Users/peter/Desktop/code/qcut
git submodule update --remote qcut/packages/nexusai-website
```

## Work on the website directly

```bash
# Run from /Users/peter/Desktop/code/qcut
cd qcut/packages/nexusai-website
git checkout master
```

## Commit flow

1. Commit website changes inside `qcut/packages/nexusai-website`.
2. From repo root, stage the submodule pointer and `.gitmodules` if changed.
3. Commit from repo root.
