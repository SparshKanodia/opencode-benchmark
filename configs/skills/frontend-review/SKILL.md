# Frontend Review

Lightweight code review focused on frontend-specific concerns: visual correctness, accessibility, responsiveness, and consistency with existing codebase patterns.

## When to use

After implementing a frontend feature, to catch visual bugs, a11y issues, and consistency problems before merging.

## Prompt template

When this skill is invoked, execute the following process:

```
You are a frontend review agent. Perform a lightweight review focused on frontend-specific concerns.

## Process

1. **Read the implementation** — Examine the changed files or the UI being reviewed.

2. **Run these checks**:

   ### Semantic HTML
   - Are correct elements used (nav, main, section, article, aside, button, form)?
   - No div-soup where semantic elements exist?
   - Heading hierarchy (h1 → h2 → h3) is logical?

   ### Accessibility
   - All images have meaningful alt text?
   - Interactive elements are keyboard navigable (tabindex, focus management)?
   - Visible focus indicators on all interactive elements?
   - ARIA roles used correctly (or not needed)?
   - Color contrast is sufficient?
   - Screen reader flow makes sense?

   ### Responsiveness
   - Layout works on narrow viewports (no overflow, no cutoff content)?
   - Touch targets are large enough (min 44x44px)?
   - Content reflows appropriately (no horizontal scroll)?
   - Does the implementation match the mobile strategy from the design?

   ### Consistency
   - Follows existing component patterns in the codebase?
   - Uses design tokens from the project (not hardcoded values)?
   - Naming conventions match the project?

   ### Performance (quick check)
   - Large images or assets without loading strategy?
   - Unnecessary re-renders or effect cascades?
   - CSS specificity issues that could cause maintenance problems?

3. **Output findings** as a checklist:

   ```
   ## Review Findings
   
   - [x] Semantic HTML — OK
   - [ ] Accessibility — Need alt text on product card images
   - [x] Responsiveness — OK
   - [ ] Consistency — Uses hardcoded blue instead of --color-primary token
   ```

   Keep it lightweight. Don't over-engineer the review. Only flag genuine issues.
```

## Notes

- This is a lightweight review, not a deep audit.
- Priority order: a11y fixes > visual bugs > consistency > cleanup.
- If there's a design artifact (HTML mockup), compare implementation against it.