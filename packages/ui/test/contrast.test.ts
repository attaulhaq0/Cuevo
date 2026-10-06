import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/tokens.css', import.meta.url), 'utf8');
const workspace = css.match(/\.workspace\s*\{([^}]+)\}/)?.[1] ?? '';
const tokens = new Map([...workspace.matchAll(/(--[a-z-]+):\s*([^;]+);/g)].map(match => [match[1], match[2].trim()]));

function color(name: string, theme: 'light' | 'dark'): string {
  const value = tokens.get(name);
  if (!value) throw new Error(`Missing workspace color ${name}`);
  const alias = value.match(/^var\((--[a-z-]+)\)$/);
  if (alias) return color(alias[1], theme);
  const pair = value.match(/^light-dark\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)$/i);
  if (pair) return pair[theme === 'light' ? 1 : 2];
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  throw new Error(`Unsupported contrast color ${name}: ${value}`);
}

function luminance(hex: string): number {
  const rgb = [1, 3, 5].map(offset => {
    const component = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return component <= .04045 ? component / 12.92 : ((component + .055) / 1.055) ** 2.4;
  });
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
}

function contrast(foreground: string, background: string): number {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
}

// Evaluate actual semantic pairs used by controls/reading/statuses. These
// constraints guard accessibility as tokens evolve; they do not freeze hexes.
const textPairs = [
  ['--color-text', '--color-surface'],
  ['--color-text-secondary', '--color-surface'],
  ['--color-text-muted', '--color-surface'],
  ['--color-text-muted', '--color-canvas'],
  ['--color-link', '--color-surface'],
  ['--color-accent', '--color-surface-accent'],
  ['--color-on-primary', '--color-action-start'],
  ['--color-on-primary', '--color-action-end'],
  ['--color-on-accent', '--color-accent-hover'],
  ['--color-on-primary', '--color-primary'],
  ['--color-on-primary', '--color-primary-hover'],
  ['--color-selection-text', '--color-selection-surface'],
  ['--color-on-brand', '--color-brand'],
  ['--color-text-secondary', '--color-surface-muted'],
  ['--color-positive', '--color-positive-surface'],
  ['--color-warning', '--color-warning-surface'],
  ['--color-danger', '--color-danger-surface'],
  ['--color-disabled-text', '--color-disabled-surface'],
] as const;

describe.each(['light', 'dark'] as const)('Trail %s semantic contrast', theme => {
  it.each(textPairs)('%s remains readable on %s', (foreground, background) => {
    const ratio = contrast(color(foreground, theme), color(background, theme));
    expect(ratio, `${foreground} on ${background}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['--color-control-border', '--color-focus', '--color-selection-border', '--color-primary-border'] as const)('%s identifies controls on reading surfaces', foreground => {
    const ratio = contrast(color(foreground, theme), color('--color-material-reading', theme));
    expect(ratio, `${foreground}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
  });
});
