/**
 * Унифицированная кнопка в неоновом стиле
 */

export default function NeonButton({
  type = 'button',
  variant = 'primary',
  className = '',
  disabled = false,
  children,
  ...props
}) {
  const base =
    'btn-neon px-4 py-2.5 font-medium text-sm transition-all duration-250 disabled:opacity-50 disabled:cursor-not-allowed';
  const variantClass =
    variant === 'secondary'
      ? 'bg-neon-surface2 text-neon-text hover:shadow-neon hover:border-neon-accent/30'
      : 'bg-neon-accent text-black hover:bg-neon-accent2 hover:shadow-neon';

  return (
    <button type={type} disabled={disabled} className={`${base} ${variantClass} ${className}`} {...props}>
      {children}
    </button>
  );
}
