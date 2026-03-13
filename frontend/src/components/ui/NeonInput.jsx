/**
 * Унифицированный инпут для тёмной неоновой темы
 */

export default function NeonInput({ className = '', ...props }) {
  return (
    <input
      className={`input-neon w-full px-4 py-2.5 text-sm ${className}`}
      {...props}
    />
  );
}
