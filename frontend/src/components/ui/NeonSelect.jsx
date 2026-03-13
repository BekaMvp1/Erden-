/**
 * Унифицированный select для тёмной неоновой темы
 */

export default function NeonSelect({ className = '', children, ...props }) {
  return (
    <select
      className={`input-neon w-full px-4 py-2.5 text-sm ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}
