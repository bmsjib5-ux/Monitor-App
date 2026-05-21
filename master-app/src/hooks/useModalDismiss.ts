import { useEffect, MouseEvent } from 'react';

/**
 * Attaches ESC key listener to close the modal.
 * Pair with stopPropagation on modal content + onClick on backdrop.
 */
export function useModalDismiss(onClose: () => void) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Helper: prevent backdrop click from propagating into modal content
  const stopPropagation = (e: MouseEvent) => e.stopPropagation();

  return { stopPropagation };
}
