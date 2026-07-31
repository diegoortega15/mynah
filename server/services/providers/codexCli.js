import { messagesToPrompt, runCli } from './util.js';

// Pull the final assistant/agent message out of Codex's JSONL event stream.
// The exact event schema varies by version, so we check several shapes.
function extractAgentMessage(stdout) {
  const lines = stdout.split(/\r?\n/).filter(Boolean);
  let last = '';
  for (const line of lines) {
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const candidates = [
      obj.item?.type === 'agent_message' && obj.item?.text,
      obj.item?.type === 'assistant_message' && obj.item?.text,
      obj.msg?.type === 'agent_message' && (obj.msg?.message ?? obj.msg?.text),
      obj.type === 'agent_message' && (obj.text ?? obj.message),
    ].filter(Boolean);
    if (candidates.length) last = String(candidates[candidates.length - 1]);
  }
  return last;
}

// OpenAI Codex CLI (`codex exec --json -`) — covered by a ChatGPT subscription
// (Plus/Pro) when logged in, or an API key. Prompt via stdin.
export async function chat(messages, { command = 'codex', model = '' } = {}) {
  const prompt = messagesToPrompt(messages);
  const args = ['exec', '--json'];
  if (model) args.push('-m', model);
  args.push('-'); // read prompt from stdin

  const { stdout, stderr, code } = await runCli(command, args, prompt, { timeoutMs: 120000 });
  if (code !== 0) throw new Error(`codex saiu com código ${code}: ${stderr.slice(0, 300)}`);

  const msg = extractAgentMessage(stdout);
  if (msg) return msg;
  // Fallback: maybe output wasn't JSONL.
  const plain = stdout.trim();
  if (plain) return plain;
  throw new Error(`codex não retornou mensagem. ${stderr.slice(0, 200)}`);
}
