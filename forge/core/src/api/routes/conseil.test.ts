import { mock, describe, test, expect, beforeEach } from "bun:test";
import { Hono } from "hono";

// Mocks déclarés avant les imports qui en dépendent
const mockGenerateText = mock(async (_opts: unknown) => ({ text: "Réponse IA test." }));
const mockGetModel     = mock((_p?: string, _m?: string) => "fake-model-object");

mock.module("ai",    () => ({ generateText: mockGenerateText }));
mock.module("@/llm", () => ({ getModel: mockGetModel }));

const { conseilRouter } = await import("./conseil");

const app = new Hono();
app.route("/", conseilRouter);

async function post(body: unknown) {
  return app.fetch(
    new Request("http://localhost/", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  mockGenerateText.mockImplementation(async () => ({ text: "Réponse IA test." }));
});

describe("POST /api/conseil", () => {
  test("retourne 400 si prompt manquant", async () => {
    const res = await post({ providers: [{ provider: "anthropic", model: "claude-haiku" }] });
    expect(res.status).toBe(400);
  });

  test("retourne 400 si providers est vide", async () => {
    const res = await post({ prompt: "Test", providers: [] });
    expect(res.status).toBe(400);
  });

  test("retourne une réponse par provider", async () => {
    const res = await post({
      prompt:    "Analyse ce projet.",
      providers: [{ provider: "anthropic", model: "claude-haiku-4-5" }],
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { responses: unknown[] };
    expect(Array.isArray(data.responses)).toBe(true);
    expect(data.responses.length).toBe(1);
  });

  test("chaque réponse contient provider, model, answer, duree_ms, error", async () => {
    const res = await post({
      prompt:    "Donne ton avis.",
      providers: [
        { provider: "anthropic", model: "claude-haiku-4-5" },
        { provider: "openai",    model: "gpt-4o-mini" },
      ],
    });
    expect(res.status).toBe(200);
    const { responses } = (await res.json()) as {
      responses: Array<{ provider: string; model: string; answer: string; duree_ms: number; error: null }>
    };
    expect(responses.length).toBe(2);
    for (const r of responses) {
      expect(r).toHaveProperty("provider");
      expect(r).toHaveProperty("model");
      expect(r).toHaveProperty("answer");
      expect(typeof r.duree_ms).toBe("number");
      expect(r.error).toBeNull();
    }
  });

  test("cap à 5 providers quand plus de 5 fournis", async () => {
    const providers = Array.from({ length: 8 }, (_, i) => ({
      provider: "anthropic",
      model:    `model-${i}`,
    }));
    const res = await post({ prompt: "Test", providers });
    expect(res.status).toBe(200);
    const { responses } = (await res.json()) as { responses: unknown[] };
    expect(responses.length).toBe(5);
  });

  test("isole l'erreur d'un provider sans faire échouer les autres", async () => {
    let callCount = 0;
    mockGenerateText.mockImplementation(async () => {
      if (callCount++ === 0) throw new Error("Provider timeout");
      return { text: "Réponse OK." };
    });

    const res = await post({
      prompt:    "Test isolation erreur",
      providers: [
        { provider: "anthropic", model: "claude-haiku-4-5" },
        { provider: "openai",    model: "gpt-4o-mini" },
      ],
    });
    expect(res.status).toBe(200);
    const { responses } = (await res.json()) as {
      responses: Array<{ error: string | null; answer: string }>
    };
    expect(responses.length).toBe(2);
    expect(responses.some((r) => r.error !== null)).toBe(true);
    expect(responses.some((r) => r.answer === "Réponse OK.")).toBe(true);
  });

  test("accepte un system prompt optionnel", async () => {
    const res = await post({
      prompt:    "Question",
      system:    "Tu es un expert en sécurité.",
      providers: [{ provider: "anthropic", model: "claude-haiku-4-5" }],
    });
    expect(res.status).toBe(200);
    expect(mockGenerateText).toHaveBeenCalled();
  });

  test("answer correspond au texte retourné par generateText", async () => {
    mockGenerateText.mockImplementation(async () => ({ text: "Analyse détaillée ici." }));
    const res = await post({
      prompt:    "Dis quelque chose",
      providers: [{ provider: "anthropic", model: "claude-haiku-4-5" }],
    });
    const { responses } = (await res.json()) as { responses: Array<{ answer: string }> };
    expect(responses[0].answer).toBe("Analyse détaillée ici.");
  });
});
