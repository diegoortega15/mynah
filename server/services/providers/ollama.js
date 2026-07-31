// Ollama — local models (free, offline). Requires Ollama running locally.
export async function chat(messages, { baseUrl = 'http://localhost:11434', model = 'llama3.1' } = {}) {
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
    }),
  }).catch((e) => {
    throw new Error(`Ollama inacessível em ${baseUrl} — está rodando? (${e.message})`);
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return j.message?.content ?? '';
}
