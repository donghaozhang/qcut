## My Engineering Preferences

> Use these to guide your recommendations:

- **DRY is important** — flag repetition aggressively.
- **Well-tested code is non-negotiable** — I'd rather have too many tests than too few.
- **"Engineered enough"** — not under-engineered (fragile, hacky) and not over-engineered (premature abstraction, unnecessary complexity).
- **Handle more edge cases, not fewer** — thoughtfulness > speed.

### Comment Guidelines

 

Examples:
```javascript
// transfer, not copy; sender buffer detaches
// satisfies: check shape; keep literals  
// keep multibyte across chunks
// timingSafeEqual throws on length mismatch
```

**Bad Comments (AI-style):**
- Don't explain what the code literally does
- Don't add changelog-style comments in code
- Don't comment every line or obvious operations

Avoid:
```javascript
// Prevent duplicate initialization
// Check if project is already loaded  
// Mark as initializing to prevent race conditions
// (changed from blah to blah)
```

**Rule:** Only add comments when there's genuinely non-obvious behavior, performance considerations, or business logic that needs context. Code should be self-documenting through naming and structure.

### Separation of Concerns

**Core Principle:** Each file should have one single purpose/responsibility. Related functionality should be grouped together, unrelated functionality should be separated.

**Good Separation:**
- One file per major concern (auth, validation, data transformation)
- Group related utilities together
- Extract shared logic into dedicated files
- Keep API routes focused on their specific endpoint logic

Examples:
```javascript
// ✅ Good: Each file has clear responsibility
/lib/rate-limit.ts          // Rate limiting utilities
/lib/validation.ts          // Input validation schemas
/lib/freesound-api.ts       // External API integration
/api/sounds/search/route.ts // Route handler only
```

**When to Separate:**
- File is getting long (>500 lines)
- Multiple distinct responsibilities in one file
- Logic could be reused elsewhere
- Complex utilities that distract from main purpose

**Rule:** One file, one responsibility. Extract shared concerns into focused utility files.

### Scannable Code Guidelines

**Core Principle:** Code should be scannable through proper abstraction, not comments. Use variables and helper functions to make intent clear at a glance.

**Good Scannable Code:**
- Extract complex logic into well-named variables
- Create helper functions for multi-step operations
- Use descriptive names that explain intent

Examples:
```javascript
// ✅ Scannable: Intent is clear from variable names
const isValidUser = user.isActive && user.hasPermissions;
const shouldProcessPayment = amount > 0 && !order.isPaid;

// ✅ Scannable: Complex logic extracted to helper
const searchParams = buildFreesoundSearchParams({ query, filters, pagination });
const transformedResults = transformFreesoundResults({ rawResults });
```

**Bad Unscannable Code:**
```javascript
// ❌ Hard to scan: What does this condition mean?
if (type === "effects" || !type) {
  params.append("filter", "duration:[* TO 30.0]");
  params.append("filter", `avg_rating:[${min_rating} TO *]`);
  if (commercial_only) {
    params.append("filter", 'license:("Attribution" OR "Creative Commons 0")');
  }
}

// ❌ Hard to scan: Complex ternary
const sortParam = query
  ? sort === "score"
    ? "score"
    : `${sort}_desc`
  : `${sort}_desc`;
```

**Rule:** Make code scannable by extracting intent into variables and helper functions. If you need to think about what code does, extract it. The reader should understand the flow without diving into implementation details.

### Ultracite Rules (Extended)

**Accessibility (a11y):**
- Always include a `title` element for icons unless there's text beside the icon
- Always include a `type` attribute for button elements
- Accompany `onClick` with at least one of: `onKeyUp`, `onKeyDown`, or `onKeyPress`
- Accompany `onMouseOver`/`onMouseOut` with `onFocus`/`onBlur`

**Code Complexity and Quality:**
- Don't use primitive type aliases or misleading types
- Don't use the comma operator
- Use for...of statements instead of Array.forEach
- Don't initialize variables to undefined
- Use .flatMap() instead of map().flat() when possible

**React and JSX Best Practices:**
- Don't import `React` itself
- Don't define React components inside other components
- Don't use both `children` and `dangerouslySetInnerHTML` props on the same element
- Don't insert comments as text nodes
- Use `<>...</>` instead of `<Fragment>...</Fragment>`

**Function Parameters and Props:**
- Always use destructured props objects instead of individual parameters in functions
- Example: `function helloWorld({ prop }: { prop: string })` instead of `function helloWorld(param: string)`
- This applies to all functions, not just React components

**Correctness and Safety:**
- Don't assign a value to itself
- Avoid unused imports and variables
- Don't use await inside loops
- Don't hardcode sensitive data like API keys and tokens
- Don't use the TypeScript directive @ts-ignore
- Make sure the `preconnect` attribute is used when using Google Fonts
- Don't use the `delete` operator
- Don't use `require()` in TypeScript/ES modules - use proper `import` statements

**TypeScript Best Practices:**
- Don't use TypeScript enums
- Use either `T[]` or `Array<T>` consistently
- Don't use the `any` type

**Style and Consistency:**
- Don't use global `eval()`
- Use `String.slice()` instead of `String.substr()` and `String.substring()`
- Don't use `else` blocks when the `if` block breaks early
- Put default function parameters and optional function parameters last
- Use `new` when throwing an error
- Use `String.trimStart()` and `String.trimEnd()` over `String.trimLeft()` and `String.trimRight()`

## Agent Orchestrator (ao) Session

You are running inside an Agent Orchestrator-managed workspace.
Session metadata is updated automatically via shell wrappers.

If automatic updates fail, you can manually update metadata:
```bash
~/.ao/bin/ao-metadata-helper.sh  # sourced automatically
# Then call: update_ao_metadata <key> <value>
```
