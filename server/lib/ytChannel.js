// Turning whatever the learner pastes into a canonical YouTube channel.
// Accepts a handle (@veritasium), any channel URL, or a VIDEO url/id — the
// video case is the common one ("gostei deste vídeo, quero o canal dele").

const VIDEO_RE = /(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{11})/;

// Pure: figure out what was pasted. Returns null when it makes no sense.
export function parseChannelInput(raw = '') {
  const input = String(raw).trim();
  if (!input) return null;

  // A video (URL or bare id) — the channel is resolved later via oEmbed.
  const v = input.match(VIDEO_RE);
  if (v) return { kind: 'video', videoId: v[1] };
  if (/^[A-Za-z0-9_-]{11}$/.test(input) && !input.startsWith('@')) {
    return { kind: 'video', videoId: input };
  }

  // A bare handle typed by hand.
  if (/^@[A-Za-z0-9._-]{3,30}$/.test(input)) {
    return { kind: 'channel', url: `https://www.youtube.com/${input}`, name: input };
  }

  // Any youtube.com channel URL shape: /@handle, /channel/UC…, /c/Name, /user/Name.
  const m = input.match(
    /youtube\.com\/(@[A-Za-z0-9._-]+|channel\/[A-Za-z0-9_-]+|c\/[A-Za-z0-9._-]+|user\/[A-Za-z0-9._-]+)/i
  );
  if (m) {
    const path = m[1];
    const name = path.startsWith('@') ? path : path.split('/')[1];
    return { kind: 'channel', url: `https://www.youtube.com/${path}`, name };
  }

  return null;
}

// Best-effort display name for a channel URL, from the page <title>.
// Never throws — a channel with a rough name is better than a failed save.
async function fetchChannelName(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const html = await r.text();
    const m = html.match(/<title>([^<]+)<\/title>/i);
    if (!m) return null;
    return m[1].replace(/\s*-\s*YouTube\s*$/i, '').trim() || null;
  } catch {
    return null;
  }
}

// A video's channel comes free from the public oEmbed endpoint (no API key).
async function channelFromVideo(videoId) {
  try {
    const r = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!r.ok) return null;
    const j = await r.json();
    if (!j.author_url) return null;
    return { url: j.author_url, name: j.author_name || j.author_url };
  } catch {
    return null;
  }
}

// Resolve pasted text into {url, name}, or null if it cannot be understood.
export async function resolveChannel(raw) {
  const parsed = parseChannelInput(raw);
  if (!parsed) return null;
  if (parsed.kind === 'video') return channelFromVideo(parsed.videoId);
  return { url: parsed.url, name: (await fetchChannelName(parsed.url)) || parsed.name };
}
