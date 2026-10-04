import { describe, it, expect } from 'vitest';
import { readingDocumentStyles } from '../src/export-style';

describe('self-contained reading document style', () => {
  it('uses resolved design-system values without remote assets or executable markup', () => {
    const style = readingDocumentStyles({ canvas: 'rgb(9, 22, 44)', surface: 'rgb(19, 37, 64)', muted: 'rgb(28, 51, 82)', text: 'rgb(237, 246, 255)', secondary: 'rgb(192, 213, 237)', border: 'rgb(56, 85, 120)', primary: 'rgb(20, 95, 227)', fontFamily: 'Arial, Tahoma, sans-serif' });
    expect(style).toContain('--document-canvas:rgb(9, 22, 44)');
    expect(style).toContain('--document-text:rgb(237, 246, 255)');
    expect(style).toContain('@media print'); expect(style).toContain('@media(max-width:40rem)');
    expect(style).not.toMatch(/https?:|url\(|@import|<script|#23352a|#efefe8/);
    expect(style).toMatch(/summary\{[^}]*color:var\(--document-text\)/);
  });
  it('rejects injected style values and retains native system colors when no snapshot is supplied', () => {
    expect(() => readingDocumentStyles({ canvas: '</style><script>bad</script>', surface: 'white', muted: 'white', text: 'black', secondary: 'gray', border: 'gray', primary: 'blue', fontFamily: 'Arial' })).toThrow();
    expect(readingDocumentStyles()).toContain('CanvasText');
    expect(readingDocumentStyles()).not.toContain('light-dark(');
  });
});
