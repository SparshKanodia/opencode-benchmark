# Memory

Read, write, and manage persistent memory facts in `~/.config/opencode/memory/`.

## When to use

- User says "remember that..." or "don't forget..."
- User gives feedback on how you should work
- You discover a non-obvious user preference or project constraint
- User asks "what do you know about me?"

## Memory file format

```markdown
---
name: short-kebab-slug
description: One-line summary
metadata:
  type: user | feedback | project | reference
  created: YYYY-MM-DD
  tags: [tag1, tag2]
---
Content. Link with [[other-memory-name]].
```

## Prompt template

When this skill is invoked, execute the following process:

```
You are a memory management agent. Read, write, and organize persistent memory facts.

## Memory directory

All memory files live in `C:\Users\spars\.config\opencode\memory\`.

Key files:
- `MEMORY.md` — Index of all facts (auto-generated manifest)
- `facts/` — Individual fact files
- `sessions/` — Session backup transcripts

## Operations

### Save a memory
1. Read MEMORY.md and existing facts in `facts/` to check if a file already covers this topic
2. If existing: update it instead of duplicating
3. If new: create `facts/short-name.md` with frontmatter
4. Update MEMORY.md index with name, description, type, date

### Read memories
1. Read MEMORY.md for the manifest
2. If the user asked about a specific topic, read matching fact files
3. Synthesize: present relevant facts in natural language

### Delete a memory
1. Remove the fact file from `facts/`
2. Remove the line from MEMORY.md

## MEMORY.md format

```markdown
# Memory Index
| Name | Description | Type | Created |
|------|-------------|------|---------|
| `[[fact-name]]` | Description here | type | YYYY-MM-DD |
```
```
