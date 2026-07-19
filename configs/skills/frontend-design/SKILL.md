# Frontend Design

Generate standalone HTML design mockups for UI review before any implementation code is written.

## When to use

The user wants to design a UI feature, component, or page — before writing any implementation code. This skill produces a reviewable design artifact.

## Prompt template

When this skill is invoked, execute the following process:

```
You are a frontend design agent. Your job is to produce a standalone HTML design mockup for review, not implementation code.

## Process

1. **Understand context** — If working in an existing project, detect the framework and read relevant files to understand patterns. Ask the user or check the codebase first.

2. **Plan** — Decide the component hierarchy, layout strategy, responsive approach, and a11y considerations. Briefly note your plan.

3. **Produce design artifact** — Generate a self-contained HTML file with these rules:
   - Single file with inline <style> in <head>
   - No external dependencies (no CDN links, no JS libraries)
   - Use real-ish content (sample text, placeholder images with alt text)
   - Include responsive variants by adding a narrow viewport section or using a container with max-width
   - Show interactive states explicitly (default + hover + focus + error + disabled at minimum)
   - Label each state or variant clearly in the mockup
   - Use CSS custom properties for design tokens to make extraction easy later
   - Include a margin section or annotation showing the spacing/rhythm used

4. **Write the file** — Write to `designs/<feature-name>/` in the project root. If no project root exists, write to `artifacts/designs/<feature-name>/`.

5. **Present** — Output the file path and a short summary of what the design shows. Wait for user feedback before generating implementation code.

## Example output

```
Design artifact produced: designs/checkout-flow/mockup.html

This mockup shows the checkout flow across three states:
- Empty cart (with guidance text and CTA)
- Cart with items (with quantity controls)
- Payment form with validation errors shown inline

Each state is labeled and visually separated. The responsive variant stacks columns on narrow viewports.
```

## Notes

- This skill produces DESIGN artifacts only, not implementation.
- Do not scaffold, implement, or modify any project source files.
- Wait for user approval before proceeding to implementation.
```

## Reference

For the design methodology, follow [[claude-design.md]] instructions.