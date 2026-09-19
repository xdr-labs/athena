import { describe, expect, test } from 'bun:test'
import {
  renderSourcePage,
  validateSource,
  type KnowledgeSource,
} from './sync-github-knowledge.ts'

const source: KnowledgeSource = {
  project: 'data-relay-link',
  title: 'Data Relay Link — Canonical Source of Truth',
  repository: 'datarelay-labs/data-relay-link',
  ref: 'main',
  source_path: 'knowledge/CANONICAL_SOURCE_OF_TRUTH.md',
  wiki_path: 'projects/data-relay-link/canonical-source-of-truth',
}

describe('knowledge source validation', () => {
  test('accepts a canonical project source', () => {
    expect(() => validateSource(source)).not.toThrow()
  })

  test('rejects traversal and non-project wiki paths', () => {
    expect(() => validateSource({ ...source, source_path: '../secret' })).toThrow()
    expect(() => validateSource({ ...source, wiki_path: 'random/page' })).toThrow()
  })
})
describe('canonical projection rendering', () => {
  test('marks the page as derived and preserves source metadata', () => {
    const text = renderSourcePage(source, '# Canonical\n\nDecision body', 'abc123')
    expect(text).toContain('Derived knowledge. Do not edit this page manually.')
    expect(text).toContain('GitHub/OpenSpec remains authoritative')
    expect(text).toContain('datarelay-labs/data-relay-link')
    expect(text).toContain('abc123')
    expect(text).toContain('# Canonical')
    expect(text).toContain('Decision body')
  })
})
