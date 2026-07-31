import type { BlockStatus } from './types';

// Small "done today / still pending" banner for a daily block.
export default function DayBanner({
  block,
  doneText,
  pendingText,
}: {
  block?: BlockStatus | null;
  doneText: string;
  pendingText: string;
}) {
  if (!block) return null;
  return (
    <div className={`vocab-status ${block.done ? 'done' : ''}`}>
      {block.done
        ? `✅ ${doneText}${block.info ? ` · ${block.info}` : ''}`
        : `📌 ${pendingText}`}
    </div>
  );
}
