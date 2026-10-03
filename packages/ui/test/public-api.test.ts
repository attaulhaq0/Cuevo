import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button, CuevoIcon, Status, type CuevoIconName } from '../src/index';

describe('shared component compatibility', () => {
  it('preserves native form attributes, pending attributes and custom classes', () => {
    const html = renderToStaticMarkup(createElement(Button, {
      type: 'submit', form: 'saved-draft', name: 'action', value: 'retry',
      disabled: true, 'aria-busy': true, className: 'receipt-retry', variant: 'secondary',
    }, 'Retry the same save'));
    expect(html).toContain('type="submit"');
    expect(html).toContain('form="saved-draft"');
    expect(html).toContain('name="action"');
    expect(html).toContain('value="retry"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('button button--secondary receipt-retry');
    expect(html).toContain('Retry the same save');
  });

  it('preserves the caller click handler and does not invent a native button type', () => {
    const onClick = () => undefined;
    const element = Button({ onClick, children: 'Continue' });
    expect(element.props.onClick).toBe(onClick);
    expect(element.props.type).toBeUndefined();
    expect(element.props.className).toBe('button button--primary ');
    expect(renderToStaticMarkup(createElement(Button, { type: 'button', variant: 'quiet' }, 'Cancel')))
      .toContain('class="button button--quiet ');
  });

  it.each(['neutral', 'positive', 'warning'] as const)('keeps %s status text independent of the decorative dot', tone => {
    const html = renderToStaticMarkup(createElement(Status, { tone, children: 'Awaiting school review' }));
    expect(html).toContain(`class="status status--${tone}"`);
    expect(html).toContain('<span aria-hidden="true" class="status__dot"></span>Awaiting school review');
    expect(html).not.toContain('role="status"');
  });
});

describe('controlled workspace icon coverage', () => {
  // Current supported destinations and actions, rather than a copy of registry keys.
  const workspaceNames: CuevoIconName[] = [
    'home', 'learning', 'community', 'portfolio', 'assessment', 'development',
    'curriculum', 'school', 'settings', 'notification', 'search', 'calendar',
    'goal', 'reflection', 'close', 'check', 'refresh', 'logout',
  ];

  it.each(['arrow', 'chevron', 'help', 'eye', 'eyeOff', 'language', 'student', 'parent', 'device', 'lock', 'email', 'feedback', 'practice', 'shield', 'progress', 'milestones', 'person', 'people'] as const)('retains the existing %s utility/role name', name => {
      const html = renderToStaticMarkup(createElement(CuevoIcon, { name }));
      expect(html).toContain('<svg');
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain('width="20" height="20"');
    });

  it.each(workspaceNames)('renders the %s metaphor through the public registry', name => {
    const html = renderToStaticMarkup(createElement(CuevoIcon, { name }));
    expect(html).toContain('<svg');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('width="20" height="20"');
    expect(html).toMatch(/<image href="[^"]+"/);
  });

  it.each(['community', 'portfolio', 'assessment', 'development', 'curriculum', 'notification'] as const)('resolves both legacy %s variants to the sole illustrated asset', name => {
      const html = renderToStaticMarkup(createElement(CuevoIcon, { name, variant: 'filled', size: 32 }));
      expect(html).toContain('width="32" height="32"');
      expect(html).toMatch(/<image href="[^"]+"/);
      expect(html).toBe(renderToStaticMarkup(createElement(CuevoIcon, { name, variant: 'outline', size: 32 })));
      expect(html).not.toContain('class="lucide');
    });

  it('keeps caller dimensions and classes without changing illustration pixels', () => {
    const html = renderToStaticMarkup(createElement(CuevoIcon, {
      name: 'search', variant: 'filled', size: 28, className: 'search-control', strokeWidth: 2,
    }));
    expect(html).toContain('width="28" height="28"');
    expect(html).toMatch(/<image href="[^"]+"/);
    expect(html).toContain('search-control');
  });

  it('preserves an explicitly named icon when the caller provides nondecorative semantics', () => {
    const html = renderToStaticMarkup(createElement(CuevoIcon, {
      name: 'help', 'aria-hidden': false, role: 'img', 'aria-label': 'Help',
    }));
    expect(html).toContain('aria-hidden="false"');
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Help"');
  });
});
