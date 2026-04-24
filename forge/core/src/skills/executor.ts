export interface ParsedSkill {
  name: string
  description: string
  instructions: string
  triggers: string[]
  version: string
}

export function parseSkillMd(md: string): ParsedSkill {
  const name        = md.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? 'Unnamed Skill'
  const description = md.match(/^>\s*(.+)$/m)?.[1]?.trim() ?? ''
  const version     = md.match(/version[:\s]+(\S+)/i)?.[1]  ?? '1.0'
  const triggers    = (md.match(/triggers?[:\s]+\[([^\]]+)\]/i)?.[1] ?? '')
    .split(',').map(t => t.trim()).filter(Boolean)

  const instrMatch  = md.match(/##\s*Instructions?\s*\n([\s\S]+?)(?=\n##|$)/i)
  const instructions = instrMatch?.[1]?.trim() ?? md

  return { name, description, instructions, triggers, version }
}

export function buildSkillsContext(
  skills: Array<{ nom: string; skillMd: string }>,
): string {
  if (!skills.length) return ''
  return skills.map(s => {
    const p = parseSkillMd(s.skillMd)
    return `### Skill: ${p.name}\n${p.instructions}`
  }).join('\n\n')
}

export function matchesSkillTriggers(
  input: string,
  skills: Array<{ nom: string; skillMd: string }>,
): Array<{ nom: string; skillMd: string }> {
  return skills.filter(s => {
    const p = parseSkillMd(s.skillMd)
    if (!p.triggers.length) return true
    return p.triggers.some(t => input.toLowerCase().includes(t.toLowerCase()))
  })
}
