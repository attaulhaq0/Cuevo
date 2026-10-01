import Link from 'next/link';
import Image from 'next/image';
import logo from '../assets/cuevo-mark.webp';

export function Brand({ compact = false, attribution = false }: { compact?: boolean; attribution?: boolean }) {
  return <Link href="/" className={`brand ${compact ? 'brand--compact' : ''}`} aria-label="Cuevo by E Deviser">
    <Image className="brand__mark" src={logo} alt="" sizes={compact ? '48px' : '(min-width: 768px) 80px, 48px'} />
    <span className="brand__name" dir="ltr">Cuevo{attribution ? <small className="brand__attribution">by E Deviser</small> : null}</span>
  </Link>;
}
