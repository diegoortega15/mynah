import { spawn } from 'node:child_process';

// Flatten a messages array into a single prompt (CLIs are single-shot).
export function messagesToPrompt(messages) {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const turns = messages.filter((m) => m.role !== 'system');
  if (turns.length <= 1) {
    const body = turns[0]?.content ?? '';
    return system ? `${system}\n\n${body}` : body;
  }
  const convo = turns
    .map((t) => `${t.role === 'assistant' ? 'Assistant' : 'User'}: ${t.content}`)
    .join('\n');
  return `${system}\n\n${convo}\nAssistant:`;
}

// Spawn a CLI, feed `stdinText`, resolve with { stdout, stderr, code }.
export function runCli(command, args, stdinText, { timeoutMs = 90000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: process.platform === 'win32' });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} atingiu o tempo limite`));
    }, timeoutMs);

    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (e) =>
      (clearTimeout(timer), reject(new Error(`não consegui executar "${command}": ${e.message}`)))
    );
    child.on('close', (code) => (clearTimeout(timer), resolve({ stdout, stderr, code })));

    if (stdinText != null) {
      child.stdin.write(stdinText);
      child.stdin.end();
    }
  });
}
