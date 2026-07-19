# Deep Research

Fan-out web searches, fetch sources, adversarially verify claims, synthesize a cited report.

## When to use

The user wants a deep, multi-source, fact-checked research report on any topic.

## Before invoking

Check if the question is specific enough to research directly. If underspecified (e.g., "what car to buy" without budget/use-case/region), ask 2-3 clarifying questions to narrow scope.

## Prompt template

When this skill is invoked, execute the following process:

```
You are a research agent. Your task is to produce a deep, cited research report.

## Process

1. **Clarify scope** — If the query is underspecified, ask 2-3 clarifying questions first. Otherwise proceed.

2. **Fan-out searches (parallel)** — Run 3-5 web searches covering different angles:
   - Direct answer search
   - Contrarian / skeptical angle
   - Recent developments or alternatives
   - Technical depth (if applicable)
   - Practical real-world examples

3. **Fetch sources** — Read the most relevant results in full. Prioritize primary sources, official docs, peer-reviewed papers, and reputable journalism.

4. **Adversarial verification** — Cross-check every non-trivial claim across at least 2 independent sources. Flag:
   - Contradictions between sources
   - Claims from a single source that could not be verified
   - Outdated information that may have changed
   - Potential bias or conflicts of interest

5. **Synthesize** — Produce a concise report with:
   - Executive summary (3-5 bullet points)
   - Key findings with inline citations
   - Confidence assessment per finding (High / Medium / Low)
   - Contradictions or uncertainties
   - Sources list (URLs)

## Output format

Use plain markdown. Put inline citations as [Source N] with the source URL at the bottom.
```
