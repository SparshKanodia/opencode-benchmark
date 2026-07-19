# Frontend Development Workflow

A structured workflow for frontend work — from design through implementation and review. This workflow is framework-agnostic and adapts to the project's existing patterns.

## Workflow Phases

### Phase 1: Understand

Before writing any code, understand the full context:
- Read the requirements or user request
- If working in an existing project, read relevant components, detect the framework (React, Vue, Svelte, vanilla, etc.)
- Identify existing design tokens, component patterns, and coding conventions
- Identify any existing design system or style library
- Note constraints: browser support, accessibility requirements, performance budgets
- Return a brief summary of findings

Output: A short context summary.

### Phase 2: Plan

Plan the implementation approach:
- Component tree — hierarchy of components needed
- Data flow — how data moves between components (props, context, state, stores)
- Responsive strategy — breakpoint decisions, layout approach per breakpoint
- Accessibility checklist — what semantic elements, ARIA roles, keyboard patterns are needed
- File structure — where each component will live
- Dependencies — any new libraries, utilities, or helpers needed

Output: A plan summary to review before proceeding.

### Phase 3: Design

If the task involves new UI or significant UI changes, produce a design artifact:
- Follow the [[claude-design.md]] methodology
- Generate a **standalone HTML file** — self-contained, no external dependencies
- Write to `designs/<feature-name>/` in the project root (or `artifacts/` if no project root)
- Present the file path for review
- Wait for approval before proceeding to implementation

If the task has no UI changes (pure logic, refactoring, bug fix), skip to Phase 4.

Output: Self-contained HTML design artifact with file path.

### Phase 4: Scaffold

Set up the implementation structure:
- Create component files following the project's existing conventions (same casing, same imports)
- Define TypeScript / JSDoc types for component props
- Set up any necessary CSS module files or style files
- Create Storybook stories or test shell files if the project uses them
- Don't implement logic yet — just structure and types

Output: File structure with stubs.

### Phase 5: Implement

Build the components:
- Work top-down (pages → compositions → components → atoms)
- Extract reusable patterns as you go
- Handle all states: loading, empty, error, success, disabled
- Add responsive behavior during implementation, not as an afterthought
- Include keyboard interactions and ARIA attributes
- Follow existing coding patterns and conventions

Output: Implemented components.

### Phase 6: Review

Lightweight review focused on:
- **Visual** — Does the implementation match the design artifact?
- **Semantic HTML** — Using correct elements (nav, main, section, button, etc.)?
- **Accessibility** — Alt text, focus management, ARIA roles, color contrast, keyboard navigation
- **Responsiveness** — Does it work on mobile, tablet, desktop?
- **Reusability** — Are there opportunities to extract shared patterns?
- **Consistency** — Does it follow the existing codebase patterns?

Output: List of findings with severity.

### Phase 7: Refine

Address review findings:
- Fix bugs and a11y issues first
- Polish interactions and transitions
- Handle edge cases
- Remove unused code
- Verify the fix didn't break anything else

Output: Refined implementation.

## When to Skip Phases

| Phase | Skip when |
|-------|-----------|
| Understand | Task is trivial or well-understood |
| Plan | Task is single component, well-scoped |
| Design | No UI changes (bug fix, refactor, logic only) |
| Scaffold | Adding single function or small tweak |
| Implement | Design phase produced a sufficient mockup and implementation is not needed |
| Review | Trivial change, or review was done during implementation |
| Refine | No findings from review |

## Framework Detection

When entering a project with unknown stack, use these indicators:

| File pattern | Likely framework |
|---|---|
| `package.json` → `dependencies` containing `react` | React |
| `*.vue` files | Vue |
| `*.svelte` files | Svelte |
| `next.config.*` or `app/` directory | Next.js |
| `nuxt.config.*` | Nuxt |
| `remix.config.*` | Remix |
| `astro.config.*` | Astro |
| `angular.json` | Angular |
| `svelte.config.*` | SvelteKit |

Once detected, adhere to that framework's conventions for routing, component naming, data fetching, and styling.