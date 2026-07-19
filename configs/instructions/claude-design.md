# Claude Design Methodology

A framework for approaching frontend design work — how to think about, plan, and produce UI designs before writing code.

## Core Principles

1. **Design before code** — Always produce a design artifact (standalone HTML mockup) before implementing. Get it reviewed first.
2. **Framework agnostic** — If working in an existing project, detect the framework, component patterns, and any design system from the codebase. If starting fresh, choose based on project needs.
3. **Accessibility is not optional** — Every design decision must consider screen readers, keyboard navigation, color contrast, and semantic HTML.
4. **Mobile-first thinking** — Design for the narrowest viewport first, then add complexity for larger screens.
5. **Whitespace is a tool** — Use spacing to create visual hierarchy, grouping, and breathing room. Never cram elements together.

## Design Process

### 1. Translate Requirements

Before touching a UI, understand:
- What is the user's goal on this screen/page?
- What information must be shown vs what can be hidden or progressive?
- What actions can the user take? What are the primary vs secondary actions?
- What states exist: loading, empty, error, success, edge cases?

Write these down as a short design brief before starting.

### 2. Component Decomposition

Break the UI into a hierarchy:
- **Pages** — Full screen layouts
- **Compositions** — Reusable groups of components (sidebars, cards, forms)
- **Components** — Individual UI pieces (buttons, inputs, headers)
- **Atoms** — Smallest building blocks (icons, badges, text styles)

Sketch the component tree mentally or as a list. Every component should answer: what data does it need, and what states does it handle?

### 3. Layout Strategy

For every screen, decide the layout approach:
- **Single column** — Simple content, mobile, detail views
- **Sidebar + content** — Navigation-heavy, dashboard layouts
- **Masonry / grid** — Gallery, card lists, media-heavy content
- **Overlay / modal** — Focused tasks, confirmations, forms

Use CSS Grid for 2D layouts (full page grids) and Flexbox for 1D layouts (toolbars, card rows). Avoid hacky positioning.

### 4. Visual Hierarchy

Create visual order using:
- **Size** — Primary actions larger, emphasis through scale
- **Spacing** — More whitespace around important elements
- **Contrast** — Foreground vs background, text vs surface
- **Color** — Use color sparingly, only to communicate meaning
- **Typography** — Establish a type scale (heading levels, body, caption, label)

### 5. Interaction Patterns

Every interactive element needs these states:
- **Default** — How it looks at rest
- **Hover** — Visual feedback on mouseover
- **Focus** — Visible focus ring for keyboard users
- **Active / Pressed** — Momentary feedback on interaction
- **Disabled** — Grayed out, no interaction
- **Loading** — Show activity indicator, preserve layout (avoid layout shift)
- **Error** — Inline error messages, not just toast/alert
- **Empty** — Meaningful empty states with guidance
- **Success** — Confirmation feedback

### 6. Design Token Discovery

When working in an existing project, extract design tokens from the codebase rather than inventing new ones:
- Look in theme files, CSS custom properties, or Sass variables
- Check existing component styles for consistent values
- Use the existing color palette, spacing scale, and type scale
- Only introduce new tokens when the existing system genuinely can't satisfy the requirement

When working in a greenfield project, define tokens as you go:
- Derive from the first few components you build
- Extract common values into variables as patterns emerge
- Don't over-abstract upfront — let the design guide the token structure

## Design Artifact Production

### Standalone HTML Mockups

Before any implementation, produce a self-contained HTML file for review:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Design Mockup - Feature Name</title>
  <style>
    /* All styles inline. No external dependencies. */
    /* Use CSS custom properties for tokens to make them easy to extract later. */
  </style>
</head>
<body>
  <!-- Mockup content. Use real-ish data. Multiple variants if useful. -->
  <!-- Label interactive states with comments or visible state labels. -->
</body>
</html>
```

Rules:
- Single file with inline `<style>` — no external CSS, JS, or dependencies
- Use real-ish content (placeholder text, sample data)
- Include responsive variants if relevant
- Label states explicitly (e.g., show both default and error state of a form)
- Write to a `designs/` directory at project root (or `artifacts/` if no project root)
- Present the file path for review before any implementation code

## Iteration Cycle

1. **Produce** — Generate the design artifact
2. **Review** — Present for feedback (visual, a11y, responsive)
3. **Adjust** — Incorporate feedback, produce new version
4. **Approve** — Only after approval, proceed to implementation
5. **Implement** — Write real components following the design