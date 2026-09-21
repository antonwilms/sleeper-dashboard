import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

// Guards the convention in CLAUDE.md → Self-maintenance: reference docs state capability and
// mechanism, never current data availability. See .claude/tasks/docs-no-dated-availability.md
// (§1-§2) for why this exists — a dated availability claim goes stale on a known schedule (the
// day the file it describes ships) and, because the implementation-reviewer treats in-repo docs
// as ground truth, a stale claim reads as a contradiction against correct code and burns a review
// round. §2 there is the load-bearing scope definition this test implements.

// Reference docs, per §2's table — expressed as globs so the in-scope set is DERIVED from §2,
// not transcribed by hand. `docs/nav/*.md` means a future `docs/nav/<new>.md` is guarded
// automatically instead of silently falling outside the file list. `docs/cross-repo-registry.md`
// is EXCLUDED, deliberately and by name, not merely omitted: it is byte-identity CI-enforced from
// the data repo (CR-24), so a fix to a stale sentence inside it cannot land from this repo. The
// docs/design_*, docs/dynasty-*, and docs/design_handoff_*/docs/design_brief_v2 strategy docs are
// also excluded — they are dated records of what was believed when a decision was made, not
// claims about current data, and rewriting them destroys the record rather than correcting an
// error. `src/` comments are in the convention's scope but NOT in this guard's file set (per §5:
// scoping a comment-only matcher cheaply is not worth it) — future `src/` cases are caught by
// review, not this test.
const IN_SCOPE_GLOBS = [
  'CLAUDE.md',
  'docs/navigation.md',
  'docs/nav/*.md',
  'docs/ui.md',
  'docs/architecture.md',
  'docs/integrations.md',
  'docs/signal-registry.md',
]

const EXCLUDED_GLOBS = [
  'docs/cross-repo-registry.md', // mirrored, CR-24 byte-identity
  'docs/design_*',
  'docs/dynasty-*',
  'docs/design_handoff_*/**',
  'docs/design_brief_v2/**',
]

// Minimal glob support — only `*` (single path segment) and `**` (any depth) are needed for the
// patterns above. Not a general-purpose matcher.
function globToRegExp(glob) {
  let source = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*' && glob[i + 1] === '*') {
      source += '.*'
      i++
    } else if (c === '*') {
      source += '[^/]*'
    } else if ('.+^${}()|[]\\'.includes(c)) {
      source += '\\' + c
    } else {
      source += c
    }
  }
  return new RegExp(`^${source}$`)
}

function matchesAnyGlob(file, globs) {
  return globs.some((g) => globToRegExp(g).test(file))
}

// Expands a single in-scope glob into the actual files that exist on disk right now.
function expandInScopeGlob(glob) {
  if (!glob.includes('*')) return [glob]
  const dir = path.dirname(glob)
  const namePattern = globToRegExp(path.basename(glob))
  return readdirSync(dir)
    .filter((name) => namePattern.test(name))
    .map((name) => `${dir}/${name}`)
    .sort()
}

const IN_SCOPE_FILES = IN_SCOPE_GLOBS.flatMap(expandInScopeGlob).filter(
  (file) => !matchesAnyGlob(file, EXCLUDED_GLOBS)
)

// Case-insensitive, matched per SENTENCE, not per line — these docs have 400-character table
// cells AND hard-wrapped prose (CLAUDE.md, docs/ui.md, docs/architecture.md,
// docs/integrations.md are wrapped at ~100 columns), so a banned phrase can straddle either a
// table cell boundary or a line wrap; a line-level match can't say which clause is at fault and
// misses the wrap case entirely. Each alternative is a phrasing this task file's sweep (§3) found
// in the wild; `loaded`, the three future-tense branches (will publish/land/exist), and the
// `completed` branch (fix pass 1, §1.6) were added after earlier drafts of the pattern missed real
// violations. Fix pass 2 §2.1 removed the `once … (lands|runs|publishes)` alternative entirely —
// measured against the live tree it had zero true positives across all eight in-scope files, and
// it had a live false-positive path no bound could close ("computed once per render, then re-runs
// on filter change" matches at 21 characters, inside any bound wide enough to keep true positives
// like "once the weekly job runs" at 15).
const AVAILABILITY_PATTERN =
  /(does not exist|doesn't exist|won't exist|will not exist|not yet (?:populated|available|landed|ingested|present|written|live|loaded)|hasn't landed|haven't landed|yet to land|until the data repo|cron completes|first run after week|will publish|will land|will exist|(?:hasn't|has not|not yet) completed)/i

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

// Splits a file into blank-line-delimited blocks (paragraphs / table blocks), collapses each
// block's internal newlines to single spaces, then sentence-splits the collapsed text. This is
// what lets a banned phrase straddling a hard line-wrap ("hasn't\nlanded") be seen at all — the
// old per-line split never joined the two halves. Table rows have no blank lines between them, so
// a whole table becomes one block; that's harmless because the per-character line map below still
// attributes each matched sentence to the single source line it actually came from.
function findSentenceHits(file) {
  const lines = readFileSync(file, 'utf8').split('\n')

  const blocks = []
  let current = []
  let currentStartLine = null
  lines.forEach((line, idx) => {
    if (line.trim() === '') {
      if (current.length) {
        blocks.push({ startLine: currentStartLine, lines: current })
        current = []
        currentStartLine = null
      }
      return
    }
    if (currentStartLine === null) currentStartLine = idx + 1
    current.push(line)
  })
  if (current.length) blocks.push({ startLine: currentStartLine, lines: current })

  const hits = []
  for (const block of blocks) {
    // offsetLine[i] = source line number that joined-text character i came from.
    const offsetLine = []
    const parts = []
    block.lines.forEach((line, i) => {
      const lineNo = block.startLine + i
      for (let c = 0; c < line.length; c++) offsetLine.push(lineNo)
      parts.push(line)
      if (i < block.lines.length - 1) offsetLine.push(lineNo) // the joining space
    })
    const joined = parts.join(' ')

    let cursor = 0
    for (const piece of joined.split(SENTENCE_SPLIT)) {
      const start = joined.indexOf(piece, cursor)
      const trimmed = piece.trim()
      if (trimmed && AVAILABILITY_PATTERN.test(trimmed)) {
        const leadingWs = piece.length - piece.trimStart().length
        const charAt = Math.min(Math.max(start, 0) + leadingWs, offsetLine.length - 1)
        const lineNo = offsetLine[charAt] ?? block.startLine
        hits.push({ file, line: lineNo, sentence: trimmed })
      }
      if (start >= 0) cursor = start + piece.length
    }
  }
  return hits
}

function isAllowlisted(hit) {
  return ALLOWLIST.some((entry) => entry.file === hit.file && hit.sentence.includes(entry.substring))
}

describe('docs do not assert dated data availability', () => {
  it('excludes docs/cross-repo-registry.md explicitly (mirrored, CR-24)', () => {
    expect(IN_SCOPE_FILES).not.toContain('docs/cross-repo-registry.md')
    expect(EXCLUDED_GLOBS).toContain('docs/cross-repo-registry.md')
  })

  it('has no un-allowlisted dated-availability claim in any in-scope file', () => {
    const allHits = IN_SCOPE_FILES.flatMap(findSentenceHits)
    const violations = allHits.filter((hit) => !isAllowlisted(hit))

    // Worked example, quoted only here (this file is not in IN_SCOPE_FILES, so quoting the
    // banned form trips nothing — CLAUDE.md itself must never carry it, per fix pass 1 §1.8).
    const message = violations
      .map(
        (v) =>
          `${v.file}:${v.line} — "${v.sentence}"\n` +
          '  Reference docs state capability and mechanism, never current data availability.\n' +
          '  See .claude/tasks/docs-no-dated-availability.md §2 for the required form, or add a\n' +
          '  justified allowlist entry in this test if the sentence is genuinely definitional.\n' +
          '  Worked example — banned: "`teamcontext/2026.json` doesn\'t exist yet, so the block\n' +
          '  renders degraded"; required: "the surface branches on `loaderResult.complete`; an\n' +
          '  absent or incomplete load renders `DegradedBlock(not-yet-accruing)`."'
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

  // Fix pass 1 §1.7 — positive coverage. Nothing previously asserted that the pattern actually
  // MATCHES a known violation; a typo neutering any alternative left the whole suite green. One
  // representative sentence per top-level alternative, real quotes from the §3 sweep where one
  // exists, a plausible synthetic otherwise.
  const POSITIVE_CASES = [
    [
      'does not exist',
      'today `nfl/season-totals/<live-year>.json` does not exist yet, so `currentSeasonTotals.complete` is false.',
    ],
    ["doesn't exist", "The team-metrics slice doesn't exist in this build."],
    ['won\'t exist', "That endpoint won't exist until the next cron run."],
    ['will not exist', 'The 2027 file will not exist before the season starts.'],
    [
      'not yet (...)',
      '`loaded===true` + current season not yet loaded → `DegradedBlock` (`not-yet-accruing`).',
    ],
    [
      "hasn't landed",
      "GAME SCRIPT is PROVISIONAL(no-data) — the team-metrics slice hasn't landed, every cell renders a dash.",
    ],
    ['haven\'t landed', "These fields haven't landed in the manifest yet."],
    ['yet to land', 'The 2026 gamelogs file is yet to land in the store.'],
    [
      'until the data repo',
      'data-store files are 2017–2024 until the data repo materializes 2025.',
    ],
    ['cron completes', 'Coverage only appears once the nightly cron completes its pass.'],
    [
      'first run after week',
      "nfl/season-totals/<live-year>.json doesn't exist until the data repo's weekly cron completes its first run after week 1.",
    ],
    [
      'will publish',
      "MAX_SUPPORTED_SCHEMA = 4, raised ahead of F-24's stat-key prune, which will publish the first v4 files.",
    ],
    ['will land', "The updated schema will land in next week's release."],
    ['will exist', 'A populated 2027 file will exist before the season begins.'],
    [
      "(hasn't|has not|not yet) completed",
      "The weekly job hasn't completed yet, so the season file is absent.",
    ],
  ]

  it.each(POSITIVE_CASES)('pattern matches the %s alternative', (_label, sentence) => {
    expect(AVAILABILITY_PATTERN.test(sentence)).toBe(true)
  })

  // Must-NOT-match coverage keeps the pattern's bounds bounded. Fix pass 2 §2.1 removed the
  // `once … (lands|runs|publishes)` alternative entirely (it had a live false-positive path no
  // bound could close), so these two memo/effect-prose sentences — which matched under fix pass
  // 1's bounded version — now correctly pass.
  it('does not match ordinary prose with no availability claim', () => {
    expect(AVAILABILITY_PATTERN.test('The header renders PLAYER, TEAM, and POSITION.')).toBe(false)
    expect(
      AVAILABILITY_PATTERN.test('computed once per render, then re-runs on filter change')
    ).toBe(false)
    expect(
      AVAILABILITY_PATTERN.test('the value is resolved once the memo runs, then cached')
    ).toBe(false)
  })
})
