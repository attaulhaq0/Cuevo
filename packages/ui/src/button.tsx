import type { ButtonHTMLAttributes } from 'react';

export function Button({ className = '', variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet' }) {
  return <button {...props} className={`button button--${variant} ${className}`} />;
}
