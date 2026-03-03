/**
 * Универсальная неоновая карточка для всех страниц
 */

export default function NeonCard({ className = '', children, as: Tag = 'div', ...props }) {
  return (
    <Tag
      className={`card-neon rounded-card px-4 py-4 md:px-5 md:py-5 text-neon-text transition-all duration-250 ${className}`}
      {...props}
    >
      {children}
    </Tag>
  );
}
