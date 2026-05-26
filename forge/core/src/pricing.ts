/** Cost per 1 000 tokens in USD, keyed as "provider/model". */
const RATES: Record<string, { in: number; out: number }> = {
  'anthropic/claude-opus-4-7':              { in: 0.015,    out: 0.075   },
  'anthropic/claude-sonnet-4-6':            { in: 0.003,    out: 0.015   },
  'anthropic/claude-haiku-4-5-20251001':    { in: 0.00025,  out: 0.00125 },
  'openai/gpt-4.1':                         { in: 0.002,    out: 0.008   },
  'openai/gpt-4o':                          { in: 0.0025,   out: 0.01    },
  'openai/gpt-4o-mini':                     { in: 0.00015,  out: 0.0006  },
  'openai/o4-mini':                         { in: 0.0011,   out: 0.0044  },
  'openai/o3':                              { in: 0.01,     out: 0.04    },
  'groq/llama-3.3-70b-versatile':           { in: 0.00059,  out: 0.00079 },
  'groq/llama-4-scout-17b-16e-instruct':    { in: 0.00011,  out: 0.00034 },
  'groq/llama-4-maverick-17b-128e-instruct':{ in: 0.0002,   out: 0.0006  },
  'deepseek/deepseek-chat':                 { in: 0.00027,  out: 0.0011  },
  'deepseek/deepseek-reasoner':             { in: 0.00055,  out: 0.00219 },
  'gemini/gemini-2.5-pro':                  { in: 0.00125,  out: 0.01    },
  'gemini/gemini-2.5-flash-preview':        { in: 0.000075, out: 0.0003  },
  'gemini/gemini-2.0-flash':                { in: 0.0001,   out: 0.0004  },
  'mistral/mistral-large-latest':           { in: 0.002,    out: 0.006   },
  'mistral/codestral-latest':               { in: 0.001,    out: 0.003   },
  'mistral/ministral-8b-latest':            { in: 0.0001,   out: 0.0001  },
  'openrouter/openai/gpt-4o':               { in: 0.0025,   out: 0.01    },
  'openrouter/anthropic/claude-sonnet-4-6': { in: 0.003,    out: 0.015   },
  // Local / free providers
  'ollama/*':   { in: 0, out: 0 },
  'lmstudio/*': { in: 0, out: 0 },
  'gateway/*':  { in: 0, out: 0 },
}

export function computeCost(provider: string, model: string, tokensIn: number, tokensOut: number): number {
  const rate = RATES[`${provider}/${model}`] ?? RATES[`${provider}/*`] ?? { in: 0, out: 0 }
  return (tokensIn / 1000) * rate.in + (tokensOut / 1000) * rate.out
}
