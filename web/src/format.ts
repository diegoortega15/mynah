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

// A plain calendar date ("2026-09-03") is NOT a UTC timestamp: parsing it as one
// shifts it a day back in western time zones — a card due on the 3rd was being
// announced as "02/09 21:00". Parse as local midnight and speak in the future.
const toLocalDate = (s: string) => new Date(s + 'T00:00:00');

// Devolve a frase inteira para compor com "voltam ___": "hoje", "amanhã",
// "em 4 dias", "em 12/09" — quem chama não acrescenta preposição.
export function fmtFuture(s: string): string {
  const d = toLocalDate(s);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(d) - startOf(new Date())) / 86400000);
  if (days <= 0) return 'hoje';
  if (days === 1) return 'amanhã';
  if (days < 7) return `em ${days} dias`;
  return `em ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
}
