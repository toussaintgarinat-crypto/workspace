import { db } from './index'
import { toolCatalog, forgePersonalities } from './schema'
import { sql, eq } from 'drizzle-orm'

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

const BUILTIN_PERSONALITIES = [
  {
    label:        'Défaut',
    emoji:        '🤖',
    description:  'Comportement standard de Forge',
    systemPrompt: 'You are Forge, an expert AI assistant. Be concise, technical, and precise.',
    isBuiltin:    1,
  },
  {
    label:        'Finance & Stratégie',
    emoji:        '💰',
    description:  'Spécialisé en budgets, prévisions, ROI et décisions financières',
    systemPrompt: 'You are the Finance AI of Forge. You specialize in budgets, forecasts, invoices, cash flow, OKRs, and financial reporting. Be precise, use numbers when available, flag risks clearly.',
    isBuiltin:    1,
  },
  {
    label:        'Growth & Marketing',
    emoji:        '📈',
    description:  'Campagnes, SEO, croissance et stratégie de marque',
    systemPrompt: 'You are the Marketing AI of Forge. You specialize in campaigns, content, growth metrics, SEO, and brand strategy. Focus on measurable outcomes and creative approaches.',
    isBuiltin:    1,
  },
  {
    label:        'Sales & CRM',
    emoji:        '🤝',
    description:  'Qualification leads, pipeline et closing',
    systemPrompt: 'You are the Sales AI of Forge. You specialize in CRM, lead qualification, pipeline management, and deal closing. Apply BANT methodology and focus on conversion.',
    isBuiltin:    1,
  },
  {
    label:        'Ops & Tech',
    emoji:        '⚙️',
    description:  'Sprints, déploiements, incidents et optimisation',
    systemPrompt: 'You are the Operations AI of Forge. You specialize in project management, sprints, tasks, incidents, and process optimization. Be systematic and action-oriented.',
    isBuiltin:    1,
  },
  {
    label:        'Juridique & Compliance',
    emoji:        '⚖️',
    description:  'Contrats, conformité et audit réglementaire',
    systemPrompt: 'You are the Legal AI of Forge. You specialize in contracts, compliance, audit missions, and regulatory matters. Always flag legal risks and recommend professional review when needed.',
    isBuiltin:    1,
  },
  {
    label:        'Dev & Architecture',
    emoji:        '💻',
    description:  'Code, architecture, CI/CD et implémentations techniques',
    systemPrompt: 'You are the Dev AI of Forge. You specialize in code, architecture, CI/CD, and technical implementations. Provide clean, maintainable solutions with clear explanations.',
    isBuiltin:    1,
  },
]

export async function seedForgePersonalities() {
  console.log('[forge:seed] Peuplement des forge_personalities…')

  const existing = await db.select({ isBuiltin: forgePersonalities.isBuiltin })
    .from(forgePersonalities)
    .where(eq(forgePersonalities.isBuiltin, 1))
    .limit(1)

  if (existing.length > 0) {
    console.log('[forge:seed] forge_personalities déjà seedées, skip')
    return
  }

  await db.insert(forgePersonalities).values(
    BUILTIN_PERSONALITIES.map(p => ({
      label:        p.label,
      emoji:        p.emoji,
      description:  p.description,
      systemPrompt: p.systemPrompt,
      isBuiltin:    p.isBuiltin,
    }))
  )

  console.log(`[forge:seed] ${BUILTIN_PERSONALITIES.length} personnalités builtin insérées`)
}
