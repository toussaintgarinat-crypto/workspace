import { db } from './index'
import { toolCatalog } from './schema'
import { sql } from 'drizzle-orm'

const TOOLS = [
  // ── Outils communs (disponibles sur tous les pôles) ─────────
  { key: 'sprint',    label: 'Sprints',    icon: '⚡', commun: true,  polesDedies: [],                         ordre: 0 },
  { key: 'okr',       label: 'OKRs',       icon: '🎯', commun: true,  polesDedies: [],                         ordre: 1 },
  { key: 'documents', label: 'Documents',  icon: '📄', commun: true,  polesDedies: [],                         ordre: 2 },
  { key: 'incidents', label: 'Incidents',  icon: '🚨', commun: true,  polesDedies: [],                         ordre: 3 },

  // ── Outils dédiés ───────────────────────────────────────────
  { key: 'budget',    label: 'Budget',     icon: '💰', commun: false, polesDedies: ['finance', 'sales'],       ordre: 0 },
  { key: 'crm',       label: 'CRM',        icon: '🤝', commun: false, polesDedies: ['sales'],                  ordre: 1 },
  { key: 'facturation',label: 'Facturation',icon: '🧾', commun: false, polesDedies: ['finance'],               ordre: 2 },
  { key: 'contrats',  label: 'Contrats',   icon: '📋', commun: false, polesDedies: ['legal', 'finance'],       ordre: 3 },
  { key: 'audit',     label: 'Audit',      icon: '🔍', commun: false, polesDedies: ['legal', 'finance'],       ordre: 4 },
  { key: 'social',    label: 'Réseaux',    icon: '📣', commun: false, polesDedies: ['marketing'],              ordre: 5 },
  { key: 'veille',    label: 'Veille',     icon: '📡', commun: false, polesDedies: ['marketing'],              ordre: 6 },
  { key: 'gitpack',   label: 'GitPack',    icon: '📦', commun: false, polesDedies: ['ops'],                    ordre: 7 },
  { key: 'network',   label: 'Réseau',     icon: '🌐', commun: false, polesDedies: ['ops'],                    ordre: 8 },
]

export async function seedToolCatalog() {
  console.log('[forge:seed] Peuplement du tool_catalog…')

  for (const tool of TOOLS) {
    await db
      .insert(toolCatalog)
      .values({
        key:         tool.key,
        label:       tool.label,
        icon:        tool.icon,
        commun:      tool.commun,
        polesDedies: JSON.stringify(tool.polesDedies),
        ordre:       tool.ordre,
      })
      .onConflictDoUpdate({
        target: toolCatalog.key,
        set: {
          label:       sql`excluded.label`,
          icon:        sql`excluded.icon`,
          commun:      sql`excluded.commun`,
          polesDedies: sql`excluded.poles_dedies`,
          ordre:       sql`excluded.ordre`,
        },
      })
  }

  console.log(`[forge:seed] ${TOOLS.length} outils insérés/mis à jour`)
}
