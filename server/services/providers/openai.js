// OpenAI (GPT) via Chat Completions API. Requires an API key (billed per token).
export async function chat(messages, { apiKey, model = 'gpt-4o-mini', baseUrl = 'https://api.openai.com/v1' } = {}) {
  if (!apiKey) throw new Error('Chave da API OpenAI não configurada');
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: 0.7,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return j.choices?.[0]?.message?.content ?? '';
}
