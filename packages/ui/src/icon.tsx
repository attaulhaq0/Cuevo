import type { SVGProps } from 'react';
import { cuevoIllustratedIcons } from './illustrated-icons';
export type CuevoIconName = keyof typeof cuevoIllustratedIcons;

type CuevoIconProps = SVGProps<SVGSVGElement> & {
  name: CuevoIconName;
  size?: string | number;
  variant?: 'outline' | 'filled';
  /** Accepted for raster-icon caller compatibility; neither option changes pixels. */
  absoluteStrokeWidth?: boolean;
  nonScalingStroke?: boolean;
};

/** The sole product icon renderer. Semantic names preserve all existing callers;
 * illustration pixels do not supply access, state, academic or reward authority. */
export function CuevoIcon({ name, size = 20, variant: _variant, strokeWidth: _strokeWidth, absoluteStrokeWidth: _absoluteStrokeWidth, nonScalingStroke: _nonScalingStroke, color: _color, fill: _fill, style, className = '', role, 'aria-label': label, 'aria-hidden': hidden, ...props }: CuevoIconProps) {
  const decorative = hidden ?? (label ? undefined : true);
  return <svg {...props} aria-hidden={decorative} aria-label={label} role={role ?? (label ? 'img' : undefined)} width={size} height={size} viewBox="0 0 128 128" className={`cuevo-icon ${className}`} style={style} focusable="false">
    <image href={cuevoIllustratedIcons[name]} x="0" y="0" width="128" height="128" preserveAspectRatio="xMidYMid meet" />
  </svg>;
}
