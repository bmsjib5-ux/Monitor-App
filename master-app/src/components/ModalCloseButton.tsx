import { X } from 'lucide-react';

interface ModalCloseButtonProps {
  onClose: () => void;
  label?: string;
}

export default function ModalCloseButton({ onClose, label = 'ปิด' }: ModalCloseButtonProps) {
  return (
    <button
      onClick={onClose}
      aria-label={label}
      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none rounded p-1 transition-colors"
    >
      <X className="w-5 h-5" />
    </button>
  );
}
