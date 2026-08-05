import { describe, it, expect } from 'vitest';
import { parseChannelInput } from '../lib/ytChannel.js';

describe('parseChannelInput', () => {
  it('reconhece um handle digitado à mão', () => {
    expect(parseChannelInput('@veritasium')).toEqual({
      kind: 'channel',
      url: 'https://www.youtube.com/@veritasium',
      name: '@veritasium',
    });
  });

  it('reconhece as várias formas de URL de canal', () => {
    const cases = [
      ['https://www.youtube.com/@EnglishWithLucy', 'https://www.youtube.com/@EnglishWithLucy'],
      ['youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw', 'https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw'],
      ['https://youtube.com/c/Fireship', 'https://www.youtube.com/c/Fireship'],
      ['https://www.youtube.com/user/TEDtalksDirector', 'https://www.youtube.com/user/TEDtalksDirector'],
    ];
    for (const [input, url] of cases) {
      expect(parseChannelInput(input)).toMatchObject({ kind: 'channel', url });
    }
  });

  it('ignora o que vem depois do caminho do canal', () => {
    expect(parseChannelInput('https://www.youtube.com/@Fireship/videos')).toMatchObject({
      url: 'https://www.youtube.com/@Fireship',
    });
  });

  it('reconhece um vídeo (o canal é resolvido depois, via oEmbed)', () => {
    for (const input of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'dQw4w9WgXcQ',
    ]) {
      expect(parseChannelInput(input)).toEqual({ kind: 'video', videoId: 'dQw4w9WgXcQ' });
    }
  });

  it('devolve null para entradas sem sentido', () => {
    for (const input of ['', '   ', 'não é link', 'https://vimeo.com/12345', null, undefined]) {
      expect(parseChannelInput(input)).toBeNull();
    }
  });
});
