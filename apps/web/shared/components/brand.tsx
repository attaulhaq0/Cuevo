import Link from 'next/link';

export function Brand({ compact = false }: { compact?: boolean }) {
  return <Link href="/" className={`brand ${compact ? 'brand--compact' : ''}`} aria-label="Cuevo">
    <span className="brand__name" dir="ltr">cuevo<span aria-hidden="true">.</span></span>
  </Link>;
}
