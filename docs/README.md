# Folios — Documentation

Presentation-ready documentation for Folios. Pull any of these when asked
for "the docs." Every file is kept current as the product evolves —
see CLAUDE.md → Documentation Discipline Rule.

## Files

| File | When you'd send it |
|---|---|
| [one-pager.md](./one-pager.md) | First touch. The elevator. Print or screenshot. |
| [product-overview.md](./product-overview.md) | Substantive read after a pitch. Full capability inventory. |
| [security.md](./security.md) | Security review, IT vetting, VP sponsorship discussions. |
| [data-handling.md](./data-handling.md) | Data flow, retention, what crosses to Anthropic. Compliance reviewers ask for this. |
| [architecture.md](./architecture.md) | How Folios is built — for engineering reviewers and technical due diligence. |
| [ai-governance.md](./ai-governance.md) | How Pip is used responsibly. Guardrails, audit, cost controls. |
| [reliability.md](./reliability.md) | Uptime, observability, auto-recovery, incident response. |
| [roadmap.md](./roadmap.md) | Public-facing roadmap (separate from internal CLAUDE.md queue). |
| [changelog.md](./changelog.md) | Notable releases and capability shipments. |

## Files planned (not yet built)

These benefit from real-world input before drafting — built after the
first round of presentations / user feedback so they're shaped by
actual questions rather than guesses.

| File | What it covers |
|---|---|
| faq.md | Common objections, answered. Best written from real questions heard. |
| use-cases/account-manager.md | AM day-in-the-life. Best with real workflow patterns. |
| use-cases/leader.md | Leader visibility & team-rollup story. |
| use-cases/admin.md | Admin task-executor flow. |

## PDF versions

Every doc is also committed as a styled PDF in [`pdf/`](./pdf/) —
Folios serif headers, Pip-orb branded header, page-numbered footer.
These are what you send when someone wants a "real document" instead
of raw markdown.

To regenerate after a doc edit:

```bash
npm run docs:pdf
```

Script lives at `scripts/build-docs-pdf.js`; stylesheet at
`docs/pdf-style.css`; Pip logo at `docs/assets/pip-logo.svg`.

## Conventions

- **No marketing fluff.** Every line earns its place. Substance is the wow.
- **One capability lives in one place.** No duplicated facts across files.
- **What's shipped vs what's planned is always clearly marked.** Never imply
  capability you don't have.
- **Updated date in each file's header** so readers can see freshness.
