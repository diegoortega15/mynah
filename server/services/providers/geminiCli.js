import { messagesToPrompt, runCli } from './util.js';

// Google Gemini CLI (`gemini`) — free with a Google account. Prompt via stdin,
// plain-text response on stdout.
export async function chat(messages, { command = 'gemini', model = '' } = {}) {
  const prompt = messagesToPrompt(messages);
  const args = [];
  if (model) args.push('-m', model);
  const { stdout, stderr, code } = await runCli(command, args, prompt);
  if (code !== 0) throw new Error(`gemini saiu com código ${code}: ${stderr.slice(0, 300)}`);
  const out = stdout.trim();
  if (!out) throw new Error(`gemini não retornou resposta. ${stderr.slice(0, 200)}`);
  return out;
}
