import { TOPICS, type HelpItem } from './helpContent.js';



function Item({ it }: { it: HelpItem }) {
  if (typeof it === 'string') return <li>{it}</li>;
  return (
    <li>
      <strong>{it.b}</strong> {it.t}
    </li>
  );
}

export default function Help() {
  return (
    <div className="help">
      <h1>❓ Ajuda / Tutorial</h1>
      <p className="muted">Um guia de cada menu e função. Toque num tópico para expandir.</p>

      {TOPICS.map((t) => (
        <details key={t.title} className="card help-topic" open={t === TOPICS[0]}>
          <summary>
            <span className="hicon">{t.icon}</span> {t.title}
          </summary>
          {t.intro && <p className="help-intro">{t.intro}</p>}
          <ul>
            {t.items.map((it, i) => (
              <Item key={i} it={it} />
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
