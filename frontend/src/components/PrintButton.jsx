/**
 * Кнопка печати — вызывает window.print()
 * Опционально принимает selector печатной области (по умолчанию .print-area)
 */

export default function PrintButton({ className = '', children = 'Печать' }) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <button
      type="button"
      onClick={handlePrint}
      className={`no-print inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-1/40 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text hover:bg-accent-1/50 dark:hover:bg-dark-3 font-medium ${className}`}
      title="Печать"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2h-2m-4-1v8m0 0l-4-4m4 4l4-4" />
      </svg>
      {children}
    </button>
  );
}
