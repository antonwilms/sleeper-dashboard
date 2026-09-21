import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// Guards the convention in CLAUDE.md → Self-maintenance: reference docs state capability and
// mechanism, never current data availability. See .claude/tasks/docs-no-dated-availability.md
// (§1-§2) for why this exists — a dated availability claim goes stale on a known schedule (the
// day the file it describes ships) and, because the implementation-reviewer treats in-repo docs
// as ground truth, a stale claim reads as a contradiction against correct code and burns a review
// round. §2 there is the load-bearing scope definition this test implements.

// Reference docs, per §2's table. `docs/cross-repo-registry.md` is EXCLUDED, deliberately and by
// name, not merely omitted: it is byte-identity CI-enforced from the data repo (CR-24), so a fix
// to a stale sentence inside it cannot land from this repo. The docs/design_*, docs/dynasty-*, and
// docs/design_handoff_* strategy docs are also excluded — they are dated records of what was
// believed when a decision was made, not claims about current data, and rewriting them destroys
// the record rather than correcting an error. `src/` comments are in the convention's scope but
// NOT in this guard's file set (per §5: scoping a comment-only matcher cheaply is not worth it) —
// future `src/` cases are caught by review, not this test.
const IN_SCOPE_FILES = [
  'CLAUDE.md',
  'docs/navigation.md',
  'docs/nav/components.md',
  'docs/nav/utils.md',
  'docs/ui.md',
  'docs/architecture.md',
  'docs/integrations.md',
  'docs/signal-registry.md',
]

const EXCLUDED_FILES = [
  'docs/cross-repo-registry.md', // mirrored, CR-24 byte-identity — see comment above
]

// Case-insensitive, matched per SENTENCE (approximated here as one line's fragments, split on
// sentence-ending punctuation) rather than per line — these docs have 400-character table cells
// and a line-level match can't say which clause is at fault. Each alternative is a phrasing this
// task file's sweep (§3) found in the wild; `loaded` and the four future-tense branches
// (will publish/land/exist, once … lands/runs/publishes) were added after the first draft of the
// pattern missed two real violations.
const AVAILABILITY_PATTERN =
  /(does not exist|doesn't exist|won't exist|will not exist|not yet (?:populated|available|landed|ingested|present|written|live|loaded)|hasn't landed|haven't landed|yet to land|until the data repo|cron completes|first run after week|will publish|will land|will exist|\bonce\b[\s\S]*?\b(?:lands|runs|publishes)\b)/i

// Over-splits inside backticked paths (`Market.jsx`, `off.*`) and on abbreviations like "e.g." —
// accepted per the task file: the allowlist key is a substring, not a whole sentence, so
// over-splitting can't invalidate an entry.
const SENTENCE_SPLIT = /(?<=[.;])\s+/

// Every entry is a { file, substring, why } object, keyed on file + a distinctive verbatim
// substring rather than file:line, because file:line drifts on nearly every unrelated edit to
// these docs. `why` is mandatory: file-plus-substring seeding makes the guard pass today, but it
// is also a silencing mechanism. The next session that trips this guard on a legitimately
// definitional sentence will add a seed — and that session is the same kind of agent that was
// fooled by the stale clause this guard exists to prevent. Without a stated reason, a future
// reader can't tell a definitional exception from a silenced violation.
const ALLOWLIST = [
  {
    file: 'CLAUDE.md',
    substring: "an engine that doesn't exist",
    why:
      'The PROVISIONAL(heuristic) tag definition: "a deliberate, scoped-down stand-in for an ' +
      'engine that doesn\'t exist." Definitional use of the words — describes what the heuristic ' +
      'category means, not the availability of any data.',
  },
  {
    file: 'CLAUDE.md',
    substring: 'is not listed there does not exist for review purposes',
    why:
      'Defines what an unlisted cross-repo coupling means for review purposes ("a coupling that ' +
      'is not listed there does not exist for review purposes"). Definitional use of the words, ' +
      'not a claim about data.',
  },
  {
    file: 'docs/ui.md',
    substring: 'populate against a file that does not exist',
    why:
      "Explains why dataSeason and nflState.season are deliberately distinct derivations: " +
      'conflating them would target a file that does not exist. States a mechanism (why two ' +
      "derivations are kept separate), not today's data-availability state.",
  },
]

for (const entry of ALLOWLIST) {
  if (!IN_SCOPE_FILES.includes(entry.file)) {
    throw new Error(
      `docsAvailabilityClaims allowlist references ${entry.file}, which is not in IN_SCOPE_FILES.`
    )
  }
}

function findSentenceHits(file) {
  const lines = readFileSync(file, 'utf8').split('\n')
  const hits = []
  lines.forEach((line, idx) => {
    const sentences = line.split(SENTENCE_SPLIT)
    for (const sentence of sentences) {
      const trimmed = sentence.trim()
      if (trimmed && AVAILABILITY_PATTERN.test(trimmed)) {
        hits.push({ file, line: idx + 1, sentence: trimmed })
      }
    }
  })
  return hits
}

function isAllowlisted(hit) {
  return ALLOWLIST.some((entry) => entry.file === hit.file && hit.sentence.includes(entry.substring))
}

describe('docs do not assert dated data availability', () => {
  it('excludes docs/cross-repo-registry.md explicitly (mirrored, CR-24)', () => {
    expect(IN_SCOPE_FILES).not.toContain('docs/cross-repo-registry.md')
    expect(EXCLUDED_FILES).toContain('docs/cross-repo-registry.md')
  })

  it('has no un-allowlisted dated-availability claim in any in-scope file', () => {
    const allHits = IN_SCOPE_FILES.flatMap(findSentenceHits)
    const violations = allHits.filter((hit) => !isAllowlisted(hit))

    const message = violations
      .map(
        (v) =>
          `${v.file}:${v.line} — "${v.sentence}"\n` +
          '  Reference docs state capability and mechanism, never current data availability.\n' +
          '  See .claude/tasks/docs-no-dated-availability.md §2 for the required form, or add a\n' +
          '  justified allowlist entry in this test if the sentence is genuinely definitional.'
      )
      .join('\n\n')

    expect(violations, violations.length ? `\n\n${message}` : undefined).toEqual([])
  })

  it('every allowlist entry carries a non-empty justification', () => {
    for (const entry of ALLOWLIST) {
      expect(typeof entry.why, `${entry.file}: "${entry.substring}" has no why`).toBe('string')
      expect(
        entry.why.trim().length,
        `${entry.file}: "${entry.substring}" has an empty why`
      ).toBeGreaterThan(0)
    }
  })

  it('every allowlist entry still matches a real sentence (no stale entries)', () => {
    for (const entry of ALLOWLIST) {
      const hits = findSentenceHits(entry.file)
      const found = hits.some((hit) => hit.sentence.includes(entry.substring))
      expect(
        found,
        `${entry.file}: allowlist substring "${entry.substring}" no longer matches any sentence ` +
          'in the file. Either the sentence was rewritten (remove this stale entry) or it moved ' +
          '(update the substring) — a stale entry rots the allowlist exactly the way the docs did.'
      ).toBe(true)
    }
  })
})
