'use client';

import { useEffect, useRef } from 'react';
import { CuevoIcon } from '@cuevo/ui';
import type { authEn } from '../messages';

/** Optional reading must not resize the credential form or its studio scene. */
export function AuthPrivacy({ copy }: { copy: typeof authEn }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const restoreScroll = useRef<(() => void) | null>(null);
  useEffect(() => () => { restoreScroll.current?.(); }, []);
  function open() {
    if (!dialog.current || dialog.current.open) return;
    const root = document.documentElement;
    const overflow = root.style.overflow, gutter = root.style.scrollbarGutter;
    // Keep an existing scrollbar's space on long/reflowed layouts. No global
    // overflow rule is applied to ordinary authentication or workspaces.
    if (window.innerWidth > root.clientWidth) root.style.scrollbarGutter = 'stable';
    root.style.overflow = 'hidden';
    restoreScroll.current = () => { root.style.overflow = overflow; root.style.scrollbarGutter = gutter; restoreScroll.current = null; };
    dialog.current.showModal();
  }
  function closed() { restoreScroll.current?.(); trigger.current?.focus({ preventScroll:true }); }
  return <>
    <button ref={trigger} type="button" className="auth-privacy-trigger" aria-haspopup="dialog" aria-controls="auth-privacy-dialog" onClick={open}>
      <CuevoIcon name="shield" size={19} /><span>{copy.privacyTitle}</span><CuevoIcon name="chevron" size={20} />
    </button>
    <dialog ref={dialog} id="auth-privacy-dialog" className="auth-privacy" aria-labelledby="auth-privacy-title" onClose={closed}>
      <div className="auth-privacy__header"><CuevoIcon name="shield" size={24} /><h2 id="auth-privacy-title">{copy.privacyTitle}</h2><button type="button" autoFocus className="auth-privacy__close" aria-label={copy.privacyClose} onClick={() => dialog.current?.close()}><CuevoIcon name="close" size={24} /></button></div>
      <div className="auth-privacy__body" tabIndex={0} role="region" aria-label={copy.privacyTitle}><p>{copy.privacyBody}</p><p>{copy.privacyEnvironment}</p></div>
    </dialog>
  </>;
}
