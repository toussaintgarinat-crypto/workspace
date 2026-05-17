import { anthropic } from '@ai-sdk/anthropic'
import { openai, createOpenAI } from '@ai-sdk/openai'
import { groq } from '@ai-sdk/groq'
import { google } from '@ai-sdk/google'
import { mistral } from '@ai-sdk/mistral'
import { createOllama } from 'ollama-ai-provider'
import type { LanguageModelV1 } from 'ai'
import { db } from '@/db'
import { llmPresets, poles, agentDefinitions, poleTools } from '@/db/schema'
import { and, eq } from 'drizzle-orm'

const ollamaProvider = createOllama({
  baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/api',
})

const deepseekProvider = createOpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY || 'no-key',
})

const lmstudioProvider = createOpenAI({
  baseURL: process.env.LMSTUDIO_BASE_URL || 'http://localhost:1234/v1',
  apiKey: 'lm-studio',
})

const openrouterProvider = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY || 'no-key',
})

const gatewayProvider = createOpenAI({
  baseURL: process.env.GATEWAY_BASE_URL || 'http://gateway:4000',
  apiKey: process.env.GATEWAY_API_KEY || 'sk-forge',
})

const DEFAULT_PROVIDER = process.env.DEFAULT_LLM_PROVIDER || 'ollama'
const DEFAULT_MODEL    = process.env.DEFAULT_LLM_MODEL    || 'llama3.2'

export function getModel(provider?: string, model?: string): LanguageModelV1 {
  const p = provider || DEFAULT_PROVIDER
  const m = model   || DEFAULT_MODEL

  switch (p) {
    case 'anthropic': return anthropic(m || 'claude-sonnet-4-6') as LanguageModelV1
    case 'openai':    return openai(m   || 'gpt-4o') as LanguageModelV1
    case 'groq':      return groq(m     || 'llama-3.3-70b-versatile') as LanguageModelV1
    case 'gemini':    return google(m   || 'gemini-2.0-flash') as unknown as LanguageModelV1
    case 'mistral':   return mistral(m  || 'mistral-large-latest') as unknown as LanguageModelV1
    case 'deepseek':   return deepseekProvider(m || 'deepseek-chat') as LanguageModelV1
    case 'lmstudio':   return lmstudioProvider(m || 'local-model') as LanguageModelV1
    case 'openrouter': return openrouterProvider(m || 'openai/gpt-4o') as LanguageModelV1
    case 'gateway':    return gatewayProvider(m || 'openai/gpt-4o') as LanguageModelV1
    case 'ollama':
    default:           return ollamaProvider(m) as LanguageModelV1
  }
}

export interface LlmContext {
  agentId?:   string
  toolKey?:   string
  poleId?:    string
  ventureId?: string
  orgId?:     string
}

export async function resolveLlmConfig(ctx: LlmContext) {
  const checks: Array<{ scopeType: 'venture' | 'pole' | 'tool' | 'agent'; scopeId: string }> = []

  if (ctx.agentId) {
    checks.push({ scopeType: 'agent', scopeId: ctx.agentId })
    if (!ctx.poleId) {
      const [agent] = await db.select({ poleId: agentDefinitions.poleId })
        .from(agentDefinitions).where(eq(agentDefinitions.id, ctx.agentId))
      if (agent?.poleId) ctx.poleId = agent.poleId
    }
  }

  if (ctx.toolKey && ctx.poleId) {
    const [pt] = await db.select({ id: poleTools.id })
      .from(poleTools)
      .where(and(eq(poleTools.poleId, ctx.poleId as string), eq(poleTools.toolKey, ctx.toolKey)))
    if (pt) checks.push({ scopeType: 'tool', scopeId: pt.id })
  }

  if (ctx.poleId) {
    checks.push({ scopeType: 'pole', scopeId: ctx.poleId })
    if (!ctx.ventureId) {
      const [pole] = await db.select({ ventureId: poles.ventureId })
        .from(poles).where(eq(poles.id, ctx.poleId as string))
      if (pole?.ventureId) ctx.ventureId = pole.ventureId
    }
  }

  if (ctx.ventureId) {
    checks.push({ scopeType: 'venture', scopeId: ctx.ventureId })
  }

  for (const { scopeType, scopeId } of checks) {
    const [preset] = await db.select().from(llmPresets)
      .where(and(eq(llmPresets.scopeType, scopeType), eq(llmPresets.scopeId, scopeId)))
    if (preset) return preset
  }

  if (ctx.orgId) {
    const [global] = await db.select().from(llmPresets)
      .where(and(eq(llmPresets.scopeType, 'global' as any), eq(llmPresets.scopeId, ctx.orgId)))
    if (global) return global
  }

  return null
}

export const AVAILABLE_PROVIDERS = [
  {
    id: 'ollama', label: 'Ollama (local)',
    models: ['llama3.3', 'llama3.2', 'gemma3', 'qwen2.5', 'phi4', 'deepseek-r1', 'mistral', 'phi3', 'gemma2'],
  },
  {
    id: 'lmstudio', label: 'LM Studio (local)',
    models: ['local-model'],
  },
  {
    id: 'anthropic', label: 'Anthropic',
    models: ['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-haiku-4-5-20251001'],
  },
  {
    id: 'openai', label: 'OpenAI',
    models: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini', 'o4-mini', 'o3'],
  },
  {
    id: 'groq', label: 'Groq',
    models: ['llama-4-scout-17b-16e-instruct', 'llama-4-maverick-17b-128e-instruct', 'llama-3.3-70b-versatile', 'qwen-qwq-32b', 'gemma2-9b-it'],
  },
  {
    id: 'gemini', label: 'Gemini',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash-preview', 'gemini-2.0-flash', 'gemini-1.5-pro'],
  },
  {
    id: 'mistral', label: 'Mistral',
    models: ['mistral-large-latest', 'codestral-latest', 'ministral-8b-latest', 'mistral-small-latest'],
  },
  {
    id: 'deepseek', label: 'DeepSeek',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'openrouter', label: 'OpenRouter',
    models: [
      'openai/gpt-4.1', 'openai/gpt-4o', 'anthropic/claude-sonnet-4-6',
      'meta-llama/llama-4-maverick', 'google/gemini-2.5-pro',
      'deepseek/deepseek-r1', 'qwen/qwq-32b',
    ],
  },
  {
    id: 'gateway', label: 'LiteLLM Gateway',
    models: [
      'openai/gpt-4o', 'openai/gpt-4o-mini', 'anthropic/claude-sonnet-4-6',
      'google/gemini-2.5-flash-preview', 'ollama/llama3.2', 'ollama/llama3.3',
    ],
  },
]
