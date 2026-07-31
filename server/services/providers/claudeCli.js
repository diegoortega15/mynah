import { spawn } from 'node:child_process';
import { messagesToPrompt } from './util.js';

// Uses the Claude Code CLI in headless mode — covered by the Max subscription.
export function chat(messages, { model = 'claude-haiku-4-5', command = 'claude' } = {}) {
  const prompt = messagesToPrompt(messages);
  return new Promise((resolve, reject) => {
    const args = ['-p', '--output-format', 'json', '--model', model, '--strict-mcp-config'];
    const child = spawn(command, args, { shell: process.platform === 'win32' });

    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('claude timeout'));
    }, 90000);

    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`não consegui executar "${command}": ${e.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`claude saiu com código ${code}: ${err.slice(0, 300)}`));
      try {
        const parsed = JSON.parse(out);
        if (parsed.is_error) return reject(new Error(`claude erro: ${parsed.result}`));
        resolve(parsed.result ?? '');
      } catch {
        reject(new Error(`JSON inválido do claude: ${out.slice(0, 200)}`));
      }
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}
