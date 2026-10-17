/* JSON-mode chat completions for the build pipelines (OpenRouter by default, Gemini optional).
   Every call is priced and written to the spend ledger; calls are refused once a cap is reached. */
import { requireEnv } from "./env.mjs";
import { createLedger, BudgetError } from "./ledger.mjs";

const OPENROUTER = "https://openrouter.ai/api/v1";
const ledger = createLedger();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Remaining OpenRouter credit for the key: { limitRemaining, usage } (null fields when unlimited/unknown). */
export async function openRouterKeyInfo() {
  const res = await fetch(`${OPENROUTER}/key`, { headers: { Authorization: `Bearer ${requireEnv("OPENROUTER_API_KEY")}` } });
  if (!res.ok) throw new Error(`OpenRouter key check failed: HTTP ${res.status}`);
  const { data } = await res.json();
  return { limitRemaining: data?.limit_remaining ?? null, usage: data?.usage ?? null, isFreeTier: !!data?.is_free_tier };
}

/** Pull the first JSON object out of a model reply (tolerates ```json fences). */
export function parseJsonReply(text) {
  const raw = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try { return JSON.parse(raw); } catch { /* fall through */ }
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
  throw new Error("Reply was not JSON");
}

/**
 * One JSON chat completion via OpenRouter.
 * @param {{ model: string, system: string, user: string, temperature?: number, maxTokens?: number, job?: string, estimateUsd?: number }} o
 * @returns {Promise<{ json: object, usd: number, model: string }>}
 */
export async function chatJson({ model, system, user, temperature = 0.6, maxTokens = 16000, job = "", estimateUsd = 0.02 }) {
  ledger.assertCanSpend("openrouter", estimateUsd, job);
  const body = {
    model,
    temperature,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
    usage: { include: true },
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
  };
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`${OPENROUTER}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${requireEnv("OPENROUTER_API_KEY")}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/nosvasedis/vocab-master",
          "X-Title": "Vocab Master lesson builder",
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (res.status === 429 || res.status >= 500) throw Object.assign(new Error(`HTTP ${res.status}`), { retry: true });
      if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}: ${text.slice(0, 300)}`);
      const data = JSON.parse(text);
      const usage = data.usage || {};
      const usd = Number(usage.cost ?? 0);
      ledger.record({ provider: "openrouter", model: data.model || model, inTok: usage.prompt_tokens || 0, outTok: usage.completion_tokens || 0, usd, job });
      const content = data.choices?.[0]?.message?.content;
      return { json: parseJsonReply(content), usd, model: data.model || model };
    } catch (e) {
      if (e instanceof BudgetError) throw e;
      lastErr = e;
      if (!e.retry && !(e instanceof SyntaxError) && !/not JSON/.test(e.message)) throw e;
      await sleep(1500 * (attempt + 1) ** 2);
    }
  }
  throw lastErr;
}

export { ledger };
