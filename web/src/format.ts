// SQLite stores timestamps as "YYYY-MM-DD HH:MM:SS" in UTC (datetime('now')),
// so they must be parsed as UTC and rendered in local time.
const toDate = (s: string) => new Date(s.replace(' ', 'T') + 'Z');

// "03/08 14:25"
export function fmtWhen(s: string): string {
  const d = toDate(s);
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString(
    'pt-BR',
    { hour: '2-digit', minute: '2-digit' }
  )}`;
}

// "hoje" / "ontem" / "há 3 dias" / "03/08" — friendlier for lists.
export function fmtAgo(s: string): string {
  const d = toDate(s);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(new Date()) - startOf(d)) / 86400000);
  if (days <= 0) return 'hoje';
  if (days === 1) return 'ontem';
  if (days < 7) return `há ${days} dias`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
