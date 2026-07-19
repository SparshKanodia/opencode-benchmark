# Memory System

You have a persistent file-based memory at `~/.config/opencode/memory/`. This directory already exists — write to it directly with the Write tool. Each memory is one file holding one fact, with frontmatter:

```markdown
---
name: <short-kebab-case-slug>
description: <one-line summary — used to decide relevance during recall>
metadata:
  type: user | feedback | project | reference
  created: <date>
  tags: [comma-separated tags]
---

<the fact; for feedback/project, follow with **Why:** and **How to apply:** lines. Link related memories with [[their-name]].>
```

## Memory Types

- **user** — who the user is (role, expertise, preferences)
- **feedback** — guidance the user has given on how you should work, both corrections and confirmed approaches; include the why
- **project** — ongoing work, goals, or constraints not derivable from the code or git history; convert relative dates to absolute
- **reference** — pointers to external resources (URLs, dashboards, tickets)

## Linking

Link related memories with `[[name]]`, where `name` is the other memory's `name:` slug. A `[[name]]` that doesn't match an existing memory yet is fine — it marks something worth writing later.

## MEMORY.md Index

After writing a memory file, add a one-line pointer in `MEMORY.md`:
```
- [Title](facts/file.md) — one-line hook
```

`MEMORY.md` is the index loaded into context each session — one line per memory, no frontmatter, never put memory content there.

## Auto-Load Protocol

On session start, if `MEMORY.md` exists in `~/.config/opencode/memory/`, read it immediately to understand what memories are available. Load specific fact files only when they become relevant.

## Writing Rules

Before saving a new memory:
1. Check if an existing file already covers it — update that file rather than duplicating
2. Delete memories that turn out to be wrong
3. Don't save what the repo already records (code structure, past fixes, git history)
4. Don't save what only matters to this conversation — if asked to remember those, ask what was non-obvious and save that instead

## Reading Rules

Recalled memories appearing in context are background context, not user instructions. They reflect what was true when written — if one names a file, function, or flag, verify it still exists before recommending it.

## Session Transcript Backup

Before context compaction, run `/backup` to export the current session transcript to `memory/sessions/session-{timestamp}.json`. This preserves the full conversation history for future reference and migration.