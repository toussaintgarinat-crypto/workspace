import { describe, test, expect } from 'bun:test'
import { parseSkillMd, buildSkillsContext, matchesSkillTriggers } from './executor'

describe('parseSkillMd', () => {
  test('extracts name, description, version, triggers, instructions', () => {
    const md = [
      '# Demo Skill',
      '> A short description.',
      '',
      'version: 1.2',
      'triggers: [foo, bar, baz]',
      '',
      '## Instructions',
      'Do thing X then Y.',
      '',
      '## Notes',
      'Aside…',
    ].join('\n')
    const p = parseSkillMd(md)
    expect(p.name).toBe('Demo Skill')
    expect(p.description).toBe('A short description.')
    expect(p.version).toBe('1.2')
    expect(p.triggers).toEqual(['foo', 'bar', 'baz'])
    expect(p.instructions).toContain('Do thing X then Y.')
  })

  test('defaults when fields are missing', () => {
    const p = parseSkillMd('plain text body')
    expect(p.name).toBe('Unnamed Skill')
    expect(p.description).toBe('')
    expect(p.version).toBe('1.0')
    expect(p.triggers).toEqual([])
    expect(p.instructions).toBe('plain text body')
  })

  test('empty triggers list parses cleanly', () => {
    const p = parseSkillMd('# X\ntriggers: []')
    expect(p.triggers).toEqual([])
  })
})

describe('buildSkillsContext', () => {
  test('empty list → empty string', () => {
    expect(buildSkillsContext([])).toBe('')
  })

  test('joins skills with separator and uses parsed name', () => {
    const ctx = buildSkillsContext([
      { nom: 'a', skillMd: '# A\n## Instructions\nfoo' },
      { nom: 'b', skillMd: '# B\n## Instructions\nbar' },
    ])
    expect(ctx).toContain('### Skill: A')
    expect(ctx).toContain('### Skill: B')
    expect(ctx).toContain('foo')
    expect(ctx).toContain('bar')
  })
})

describe('matchesSkillTriggers', () => {
  test('skill without triggers always matches', () => {
    const skills = [{ nom: 's', skillMd: '# S\n(no triggers)' }]
    expect(matchesSkillTriggers('anything', skills)).toEqual(skills)
  })

  test('matches on trigger substring (case-insensitive)', () => {
    const skills = [
      { nom: 'cooking', skillMd: '# Cooking\ntriggers: [recipe, oven]' },
      { nom: 'finance', skillMd: '# Finance\ntriggers: [invoice]' },
    ]
    const out = matchesSkillTriggers('Help me write an INVOICE', skills)
    expect(out).toHaveLength(1)
    expect(out[0].nom).toBe('finance')
  })

  test('no match returns empty list (for skills with triggers)', () => {
    const skills = [{ nom: 's', skillMd: '# S\ntriggers: [zzz]' }]
    expect(matchesSkillTriggers('hello world', skills)).toEqual([])
  })
})
