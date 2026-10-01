import type { ReactNode } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}

/** Diálogo modal accesible (foco atrapado, Escape, título asociado). */
export function Modal({ open, onClose, title, children, footer, size = 'md' }: ModalProps) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-ink/40" aria-hidden />
      <div className="fixed inset-0 flex items-end justify-center p-0 sm:items-center sm:p-4">
        <DialogPanel
          className={`flex max-h-[92vh] w-full flex-col rounded-t-(--radius-panel) bg-sheet shadow-xl sm:rounded-(--radius-panel) ${size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`}
        >
          <div className="flex items-center justify-between gap-4 border-b border-line-soft px-5 py-4">
            <DialogTitle className="text-lg font-bold">{title}</DialogTitle>
            <button
              type="button"
              onClick={onClose}
              className="rounded-(--radius-control) p-1 text-ink-soft hover:bg-line-soft"
              aria-label="Cerrar"
            >
              <XMarkIcon className="size-5" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-5">{children}</div>
          {footer && (
            <div className="flex flex-wrap justify-end gap-2 border-t border-line-soft px-5 py-4">
              {footer}
            </div>
          )}
        </DialogPanel>
      </div>
    </Dialog>
  );
}
