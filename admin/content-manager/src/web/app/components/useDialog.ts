import { useEffect, useRef } from 'react';

// Plan 093: shared accessible-dialog behavior — role/aria-modal on the
// container, focus trapped inside, Escape closes, focus returns to the
// opener. Usage:
//   const dialogRef = useDialog(isOpen, onClose);
//   return isOpen ? <div ref={dialogRef} role="dialog" aria-modal="true">…</div> : null;
export function useDialog(
  isOpen: boolean,
  onClose: () => void,
  opts?: { labelId?: string }
): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const container = ref.current;
    if (!container) return;

    const previousFocus = document.activeElement as HTMLElement | null;

    const focusables = (): HTMLElement[] =>
      Array.from(
        container.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);

    const focusFirst = (): void => {
      const items = focusables();
      (items[0] ?? container).focus();
    };
    focusFirst();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      // Focus returns to the opener only if it is still connected (React
      // may have remounted it while the dialog was open).
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen, opts?.labelId]);

  return ref;
}
