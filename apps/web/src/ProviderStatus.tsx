import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from './i18n.js';

export function ProviderStatus({ label, configured }: { label: string; configured: boolean }) {
  const { t } = useI18n();
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const state = configured ? t('Provider configured') : t('Provider setup required');

  useEffect(() => {
    if (!open) return;
    function dismiss(event: KeyboardEvent) { if (event.key === 'Escape') setOpen(false); }
    function outside(event: PointerEvent) { if (!container.current?.contains(event.target as Node)) setOpen(false); }
    document.addEventListener('keydown', dismiss);
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('keydown', dismiss);
      document.removeEventListener('pointerdown', outside);
    };
  }, [open]);

  return <div className="provider-indicator" ref={container} onPointerEnter={() => setOpen(true)} onPointerLeave={() => setOpen(false)}>
    <button type="button" className="provider-status" aria-label={`${state} · ${label}`} aria-describedby={open ? id : undefined}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen(true)}>
      <span className={`status-dot ${configured ? 'available' : ''}`} aria-hidden="true" />
    </button>
    <div id={id} role="tooltip" className="provider-tooltip" data-open={open} aria-hidden={!open}>
      <span className="provider-tooltip-heading"><span className={`status-dot ${configured ? 'available' : ''}`} aria-hidden="true" />{state}</span>
      {configured && <strong>{label}</strong>}
      <span className="provider-tooltip-note">{t('No inference on navigation.')}</span>
    </div>
  </div>;
}
