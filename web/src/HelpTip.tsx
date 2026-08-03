import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { TOPICS, type HelpItem } from './helpContent.js';

function Item({ it }: { it: HelpItem }) {
  if (typeof it === 'string') return <li>{it}</li>;
  return (
    <li>
      <strong>{it.b}</strong> {it.t}
    </li>
  );
}

// Small "❓" next to each screen title: opens that screen's help topic in a
// modal — without navigating away (leaving the screen could drop a review
// session or a loaded dialogue).
export default function HelpTip({ topic }: { topic: string }) {
  const [open, setOpen] = useState(false);
  const t = TOPICS.find((x) => x.id === topic);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!t) return null;
  return (
    <>
      <button
        className="ghost mini help-tip"
        title="Como funciona esta tela"
        aria-label="Ajuda desta tela"
        onClick={() => setOpen(true)}
      >
        ❓
      </button>
      {open &&
        // Portal: the ❓ button lives inside the page's <h1>, so rendering the
        // modal in place would inherit the heading's huge bold font. The portal
        // mounts it on <body>, with normal typography.
        createPortal(
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={t.title}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row between modal-head">
              <h2>
                <span className="hicon">{t.icon}</span> {t.title}
              </h2>
              <button className="ghost mini" aria-label="Fechar" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              {t.intro && <p className="help-intro">{t.intro}</p>}
              <ul>
                {t.items.map((it, i) => (
                  <Item key={i} it={it} />
                ))}
              </ul>
            </div>
            <div className="row end">
              <Link className="linklike" to="/help" onClick={() => setOpen(false)}>
                Ver ajuda completa →
              </Link>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
