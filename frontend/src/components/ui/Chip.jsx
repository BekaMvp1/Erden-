/**
 * Чип-переключатель для фильтров и тегов
 */

export default function Chip({ active = false, className = '', children, ...props }) {
  return (
    <button
      type="button"
      className={`chip px-3 py-1.5 text-xs md:text-sm transition-all ${
        active
          ? 'bg-neon-accent text-black border-neon-accent/70 shadow-neon'
          : 'text-neon-text hover:border-neon-accent/30 hover:text-neon-accent'
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
