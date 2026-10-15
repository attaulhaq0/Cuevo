export type CommandRecoveryFocus = { restore(action: HTMLButtonElement | null): boolean; cancel(): void };

/** A pending command owns only the focused action that native disabling blurred. */
export function captureCommandRecoveryFocus(form: HTMLFormElement, origin: HTMLButtonElement | null): CommandRecoveryFocus | null {
  const document = form.ownerDocument, window = document.defaultView;
  if (!window || !origin || origin.tagName !== 'BUTTON' || origin.ownerDocument !== document || origin.form !== form || !form.contains(origin) || document.activeElement !== origin || origin.disabled) return null;
  const ownedOrigin = origin, ownerWindow = window;
  let lostOwnedFocus = false, movedOutside = false, disposed = false;
  function commandRecoveryOriginBlur(event: FocusEvent) {
    if (event.target !== ownedOrigin) return;
    if (event.relatedTarget && !form.contains(event.relatedTarget as Node)) movedOutside = true;
    if (ownedOrigin.disabled && event.relatedTarget === null) lostOwnedFocus = true;
  }
  function commandRecoveryOutsideFocus(event: FocusEvent) { if (!form.contains(event.target as Node)) movedOutside = true; }
  function commandRecoveryOutsidePointer(event: PointerEvent) { if (!form.contains(event.target as Node)) movedOutside = true; }
  function commandRecoveryDocumentBlur(event: Event) { if (event.target === ownerWindow) movedOutside = true; }
  document.addEventListener('focusout', commandRecoveryOriginBlur, { capture: true, passive: true });
  document.addEventListener('focusin', commandRecoveryOutsideFocus, { capture: true, passive: true });
  document.addEventListener('pointerdown', commandRecoveryOutsidePointer, { capture: true, passive: true });
  ownerWindow.addEventListener('blur', commandRecoveryDocumentBlur);
  function cancel() {
    if (disposed) return;
    disposed = true;
    document.removeEventListener('focusout', commandRecoveryOriginBlur, true);
    document.removeEventListener('focusin', commandRecoveryOutsideFocus, true);
    document.removeEventListener('pointerdown', commandRecoveryOutsidePointer, true);
    ownerWindow.removeEventListener('blur', commandRecoveryDocumentBlur);
  }
  return {
    restore(action) {
      if (disposed) return false;
      const current = lostOwnedFocus && !movedOutside && form.isConnected && ownedOrigin.isConnected && document.visibilityState === 'visible' && document.hasFocus() && document.activeElement === document.body && action !== null && action.ownerDocument === document && form.contains(action) && !action.disabled && action.getClientRects().length > 0;
      cancel();
      if (!current || !action) return false;
      action.focus({ preventScroll: true });
      return document.activeElement === action;
    },
    cancel,
  };
}
