# Setup ESLint for QCut Project

## Objective
Configure ESLint with TypeScript and React Hooks support to prevent common errors and maintain code quality in the QCut codebase.

## Background
- Currently experiencing React Hooks order violations ("Rendered more hooks than during the previous render")
- **Project already uses Biome (via Ultracite) for linting** - but critical React Hooks rules are disabled
- **Critical finding**: `useHookAtTopLevel` is turned OFF in biome.jsonc - this is the exact rule that would catch React Hooks errors
- Need to decide between:
  1. Enabling React Hooks rules in existing Biome configuration (simpler)
  2. Adding ESLint alongside Biome specifically for React Hooks validation (more comprehensive)

## Recommended Approach: Fix Biome Configuration First

Since the project already uses Biome, the simplest solution is to enable the React Hooks rules that are currently disabled:

### Option 1: Enable React Hooks Rules in Biome (Recommended)

1. **Update biome.jsonc** to enable critical React Hooks rules:
```jsonc
{
  "linter": {
    "rules": {
      "correctness": {
        "useHookAtTopLevel": "error",  // Change from "off" to "error"
        "useExhaustiveDependencies": "warn"  // Change from "off" to "warn"
      }
    }
  }
}
```

2. **Run Biome to find violations:**
```bash
bun run lint
```

3. **Fix violations and test:**
```bash
bun run lint:fix  # If format script exists
```

### Option 2: Add ESLint for React Hooks Only (If Biome proves insufficient)

If Biome's React Hooks support is not comprehensive enough, add ESLint specifically for React Hooks validation:

## Tasks for ESLint Setup

### 1. Install ESLint Dependencies
```bash
bun add -D \
  eslint \
  @typescript-eslint/parser \
  @typescript-eslint/eslint-plugin \
  eslint-plugin-react \
  eslint-plugin-react-hooks \
  eslint-plugin-import \
  eslint-plugin-jsx-a11y \
  eslint-plugin-unused-imports \
  eslint-config-prettier
```

### 2. Create ESLint Configuration
Create `.eslintrc.json` in the root directory:

```json
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint", "react", "react-hooks", "jsx-a11y", "unused-imports"],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "plugin:jsx-a11y/recommended",
    "prettier"
  ],
  "parserOptions": {
    "project": "./tsconfig.json",
    "ecmaVersion": 2022,
    "sourceType": "module",
    "ecmaFeatures": {
      "jsx": true
    }
  },
  "settings": {
    "react": {
      "version": "detect"
    }
  },
  "rules": {
    // React Hooks - CRITICAL for preventing hook order errors
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
    
    // TypeScript
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": "off",
    
    // Unused imports
    "unused-imports/no-unused-imports": "error",
    "unused-imports/no-unused-vars": [
      "warn",
      {
        "vars": "all",
        "varsIgnorePattern": "^_",
        "args": "after-used",
        "argsIgnorePattern": "^_"
      }
    ],
    
    // React
    "react/prop-types": "off",
    "react/react-in-jsx-scope": "off",
    
    // Import order
    "import/order": [
      "warn",
      {
        "groups": ["builtin", "external", "internal", "parent", "sibling", "index"],
        "newlines-between": "always",
        "alphabetize": {
          "order": "asc",
          "caseInsensitive": true
        }
      }
    ]
  },
  "overrides": [
    {
      "files": ["*.js", "*.jsx"],
      "rules": {
        "@typescript-eslint/no-var-requires": "off"
      }
    }
  ],
  "ignorePatterns": [
    "node_modules",
    "dist",
    "build",
    ".next",
    "out",
    "coverage",
    "*.config.js",
    "electron/",
    "apps/web/dist/"
  ]
}
```

### 3. Add Lint Scripts to package.json
Update the root `package.json` (note: `lint` script already exists for Biome):

```json
{
  "scripts": {
    "lint:eslint": "eslint \"{apps,packages}/**/*.{ts,tsx,js,jsx}\" --cache",
    "lint:eslint:fix": "eslint \"{apps,packages}/**/*.{ts,tsx,js,jsx}\" --fix --cache",
    "lint:all": "bun run lint && bun run lint:eslint"
  }
}
```

### 4. Configure VSCode Integration
Create/update `.vscode/settings.json`:

```json
{
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "eslint.validate": [
    "javascript",
    "javascriptreact",
    "typescript",
    "typescriptreact"
  ],
  "eslint.workingDirectories": [
    { "mode": "auto" }
  ]
}
```

### 5. Create .eslintignore
Create `.eslintignore` in the root:

```
node_modules/
dist/
build/
.next/
out/
coverage/
*.min.js
apps/web/dist/
electron/resources/
packages/*/dist/
.turbo/
```

### 6. Fix Existing Hook Violations

Run initial lint check to identify violations:
```bash
bun run lint
```

Common fixes needed:
- Move all hooks to the top level of components
- Remove hooks from conditional blocks
- Extract conditional logic into separate components
- Ensure hooks are called in the same order every render

### 7. Add Pre-commit Hook (Optional)
Install husky if not already present:
```bash
bun add -D husky
bunx husky install
bunx husky add .husky/pre-commit "bun run lint:strict"
```

### 8. Add GitHub Actions Workflow
Create `.github/workflows/lint.yml`:

```yaml
name: Lint

on:
  push:
    branches: [main, master, develop]
  pull_request:
    branches: [main, master, develop]

jobs:
  lint:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest
      
      - name: Install dependencies
        run: bun install --frozen-lockfile
      
      - name: Run ESLint
        run: bun run lint:strict
```

## Important Notes About Project Structure

- **TypeScript config is minimal**: Only has `strictNullChecks: true` in root tsconfig.json
- **Monorepo structure**: Uses Turborepo with apps/web and packages/* workspaces
- **Existing linting**: Uses Biome via Ultracite with many rules disabled
- **Build output**: Configured to output to external directory `d:/AI_play/AI_Code/opencut_build`

## Verification Steps

1. **Test linting is working:**
   ```bash
   # If using Biome fix:
   bun run lint
   
   # If using ESLint:
   bun run lint:eslint
   ```

2. **Fix auto-fixable issues:**
   ```bash
   bun run lint:fix
   ```

3. **Verify React Hooks rules:**
   - Create a test component with a conditional hook
   - ESLint should immediately flag it as an error

4. **VSCode integration:**
   - Open any `.tsx` file
   - Intentionally add a hook inside an if statement
   - Should see red squiggly line immediately

## Expected Outcomes

- ✅ No more "Rendered more hooks than during the previous render" errors
- ✅ Consistent code style across the codebase
- ✅ Early detection of TypeScript issues
- ✅ Improved accessibility through jsx-a11y rules
- ✅ Cleaner imports and no unused code
- ✅ CI/CD pipeline prevents bad code from being merged

## Notes

- Start with warnings (`warn`) for most rules, gradually move to errors (`error`) as the codebase improves
- The `eslint-config-prettier` ensures ESLint doesn't conflict with Prettier formatting
- Focus initially on fixing React Hooks violations as they cause runtime crashes
- Consider running `bun run lint:fix` regularly during development