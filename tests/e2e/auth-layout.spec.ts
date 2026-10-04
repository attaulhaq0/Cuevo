import { test, expect, chromium, type Page, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Geometry tests exercise unauthenticated presentation only. Native page zoom is
// verified through Chromium's tab-zoom API in a disposable profile. Equivalent
// viewport reflow, CSS zoom and text enlargement remain distinct mechanisms.
const locales = ['en', 'ar'] as const;
type Locale = typeof locales[number];
const localeName = { en: 'English', ar: 'العربية' };
const tolerance = 1.5;

async function open(page: Page, locale: Locale) {
  await page.goto('/');
  await page.getByRole('button', { name: localeName[locale], exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
  await expect(page.locator('.auth-form button[type="submit"]')).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const rect = (element: Element) => {
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y + scrollY, right: r.right, bottom: r.bottom + scrollY, width: r.width, height: r.height };
    };
    const named = (selector: string) => [...document.querySelectorAll(selector)]
      .filter(element => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0)
      .map(element => ({ name: element.id || element.className || element.tagName, ...rect(element) }));
    const sectionSelectors = { header: '.auth-header', story: '.auth-story', intro: '.auth-story__intro', visual: '.auth-visual', panel: '.auth-panel', footer: '.auth-footer' };
    const sections = Object.fromEntries(Object.entries(sectionSelectors)
      .map(([name, selector]) => [name, rect(document.querySelector(selector)!)]));
    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      sections,
      containedSectionPairs: Object.keys(sectionSelectors).flatMap(name =>
        Object.keys(sectionSelectors).filter(other => name !== other
          && document.querySelector(sectionSelectors[name as keyof typeof sectionSelectors])!.contains(document.querySelector(sectionSelectors[other as keyof typeof sectionSelectors])!))
          .map(other => `${name}/${other}`)),
      controls: named('.auth-header button, .auth-panel button:not(dialog button), .auth-panel input'),
      fields: named('.auth-form > .field, .auth-device-note, .auth-form [role="alert"], .auth-submit, .auth-help-link'),
      panel: rect(document.querySelector('.auth-panel')!),
      inputContents: [...document.querySelectorAll('.auth-input')].map(element => ({
        wrapper: rect(element), input: rect(element.querySelector('input')!),
        textLane: (() => {
          const input = element.querySelector('input')!, box = rect(input), style = getComputedStyle(input);
          const scale = box.width / (input as HTMLElement).offsetWidth;
          const x = box.x + parseFloat(style.paddingLeft) * scale;
          const right = box.right - parseFloat(style.paddingRight) * scale;
          return { ...box, x, right, width: Math.max(0, right - x) };
        })(),
        toggle: element.querySelector('button') ? rect(element.querySelector('button')!) : null,
        icon: element.querySelector(':scope > svg') ? rect(element.querySelector(':scope > svg')!) : null,
      })),
      passwordLabel: document.querySelector('.auth-field-label label') ? rect(document.querySelector('.auth-field-label label')!) : null,
      passwordHelp: document.querySelector('.auth-field-label button') ? rect(document.querySelector('.auth-field-label button')!) : null,
    };
  });
}
type Geometry = Awaited<ReturnType<typeof geometry>>;
type Rect = Geometry['panel'];

function intersects(a: Rect, b: Rect) {
  return Math.min(a.right, b.right) - Math.max(a.x, b.x) > tolerance
    && Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > tolerance;
}

function assertLayout(bounds: Geometry, state: string) {
  expect.soft(bounds.document.width, `${state}: horizontal page overflow`).toBeLessThanOrEqual(bounds.viewport.width + tolerance);
  const sections = Object.entries(bounds.sections);
  for (let i = 0; i < sections.length; i++) {
    const [name, box] = sections[i];
    expect.soft(box.x, `${state}/${name}: left boundary`).toBeGreaterThanOrEqual(-tolerance);
    expect.soft(box.right, `${state}/${name}: right boundary`).toBeLessThanOrEqual(bounds.viewport.width + tolerance);
    for (const [other, otherBox] of sections.slice(i + 1)) {
      if (bounds.containedSectionPairs.includes(`${name}/${other}`)
        || bounds.containedSectionPairs.includes(`${other}/${name}`)) continue;
      expect.soft(intersects(box, otherBox), `${state}: ${name} overlaps ${other}`).toBe(false);
    }
  }
  for (const box of bounds.controls) {
    expect.soft(box.x, `${state}/${box.name}: left boundary`).toBeGreaterThanOrEqual(-tolerance);
    expect.soft(box.right, `${state}/${box.name}: right boundary`).toBeLessThanOrEqual(bounds.viewport.width + tolerance);
    expect.soft(box.height, `${state}/${box.name}: visible control`).toBeGreaterThan(0);
  }
  for (let i = 0; i < bounds.fields.length; i++) {
    expect.soft(bounds.fields[i].x, `${state}: form content inside panel`).toBeGreaterThanOrEqual(bounds.panel.x - tolerance);
    expect.soft(bounds.fields[i].right, `${state}: form content inside panel`).toBeLessThanOrEqual(bounds.panel.right + tolerance);
    for (const next of bounds.fields.slice(i + 1)) {
      expect.soft(intersects(bounds.fields[i], next), `${state}: ${bounds.fields[i].name} overlaps ${next.name}`).toBe(false);
    }
  }
  if (bounds.passwordLabel && bounds.passwordHelp) {
    expect.soft(intersects(bounds.passwordLabel, bounds.passwordHelp), `${state}: password label overlaps account help`).toBe(false);
  }
  for (const { wrapper, input, textLane, toggle, icon } of bounds.inputContents) {
    expect.soft(input.x, `${state}: input inside wrapper`).toBeGreaterThanOrEqual(wrapper.x - tolerance);
    expect.soft(input.right, `${state}: input inside wrapper`).toBeLessThanOrEqual(wrapper.right + tolerance);
    if (toggle) {
      expect.soft(toggle.x, `${state}: password toggle inside input`).toBeGreaterThanOrEqual(input.x - tolerance);
      expect.soft(toggle.right, `${state}: password toggle inside input`).toBeLessThanOrEqual(input.right + tolerance);
      expect.soft(toggle.y, `${state}: password toggle top`).toBeGreaterThanOrEqual(input.y - tolerance);
      expect.soft(toggle.bottom, `${state}: password toggle bottom`).toBeLessThanOrEqual(input.bottom + tolerance);
    }
    if (icon) {
      expect.soft(intersects(icon, textLane), `${state}: entered text must not run underneath the input icon`).toBe(false);
      expect.soft(icon.x, `${state}: leading icon inside input`).toBeGreaterThanOrEqual(input.x - tolerance);
      expect.soft(icon.right, `${state}: leading icon inside input`).toBeLessThanOrEqual(input.right + tolerance);
      expect.soft(icon.y, `${state}: leading icon top`).toBeGreaterThanOrEqual(input.y - tolerance);
      expect.soft(icon.bottom, `${state}: leading icon bottom`).toBeLessThanOrEqual(input.bottom + tolerance);
      if (toggle) expect.soft(intersects(icon, toggle), `${state}: input icon overlaps password toggle`).toBe(false);
    }
  }
}

async function evidence(info: TestInfo, name: string, measurements: unknown) {
  await info.attach(name, { body: JSON.stringify(measurements, null, 2), contentType: 'application/json' });
}

async function screenshot(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => scrollTo(0, 0));
  await info.attach(name, { body: await page.screenshot({ fullPage: true, animations: 'disabled' }), contentType: 'image/png' });
}

async function assertTextBounds(page: Page, state: string) {
  const overflow = await page.locator('.auth-page').evaluate(element => {
    // Inputs intentionally scroll their value horizontally. Text and buttons must reflow.
    return [...element.querySelectorAll('h1,h2,h3,p,label,strong,button,summary')]
      .filter(node => node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0)
      // The optional motion-preference announcement intentionally uses a
      // screen-reader-only 1px box on mobile. All visible text still must reflow.
      .filter(node => !(node.matches('.auth-welcome-motion__status[role="status"]')
        && node.clientWidth === 1 && node.clientHeight === 1 && getComputedStyle(node).clipPath === 'inset(50%)'))
      .filter(node => node.scrollWidth > node.clientWidth + 2 || node.scrollHeight > node.clientHeight + 2)
      .map(node => ({ text: node.textContent?.trim(), width: node.clientWidth, scrollWidth: node.scrollWidth,
        height: node.clientHeight, scrollHeight: node.scrollHeight }));
  });
  expect.soft(overflow, `${state}: customer text must not be clipped by its own box`).toEqual([]);
}

async function keyboardReach(page: Page, selector: string) {
  for (let i = 0; i < 35; i++) {
    await page.keyboard.press('Tab');
    if (await page.locator(selector).evaluate(element => element === document.activeElement)) {
      const focused = await page.locator(selector).evaluate(element => {
        const r = element.getBoundingClientRect(), style = getComputedStyle(element);
        const topmost = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { visible: r.x >= -1 && r.right <= innerWidth + 1 && r.y >= -1 && r.bottom <= innerHeight + 1,
          unobscured: topmost === element || element.contains(topmost),
          focusVisible: element.matches(':focus-visible') && parseFloat(style.outlineWidth) >= 2 && style.outlineStyle !== 'none' };
      });
      expect(focused, `Focused ${selector} must be visible, unobscured, and outlined`).toEqual({ visible: true, unobscured: true, focusVisible: true });
      return;
    }
  }
  throw new Error(`Could not reach ${selector} in the keyboard order`);
}

async function nativeZoom(info: TestInfo, locale: Locale, baseURL: string) {
  const extension = info.outputPath('native-zoom-extension');
  await mkdir(extension, { recursive: true });
  await writeFile(resolve(extension, 'manifest.json'), JSON.stringify({
    manifest_version: 3, name: 'Cuevo isolated native page zoom test', version: '1.0',
    permissions: ['tabs'], background: { service_worker: 'background.js' },
  }));
  await writeFile(resolve(extension, 'background.js'), 'chrome.runtime.onInstalled.addListener(() => {});');
  // Bundled Chromium only, ephemeral profile, no user browser/settings/extension installation.
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium', headless: true, viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce',
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    baseURL,
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const page = await context.newPage(); await open(page, locale);
    const email = page.locator('#email'), password = page.locator('#password');
    const emailValue = `${'zoom.account'.repeat(10)}@example.invalid`;
    await email.fill(emailValue); await password.fill('zoom-presentation-only'); await email.focus();
    const baseline = await geometry(page);
    const metrics = () => page.evaluate(() => ({ width: innerWidth, height: innerHeight,
      dpr: devicePixelRatio, visualScale: visualViewport!.scale, bodyZoom: Number(getComputedStyle(document.body).zoom) }));
    const baselineMetrics = await metrics(); const measurements = [];
    for (const factor of [.85, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 1]) {
      const actualZoom = await worker.evaluate(async ({ factor, url }) => {
        const api = (globalThis as unknown as { chrome: { tabs: {
          query: (query: object) => Promise<{ id: number; url?: string }[]>;
          setZoom: (id: number, factor: number) => Promise<void>;
          getZoom: (id: number) => Promise<number>;
        } } }).chrome;
        const tab = (await api.tabs.query({})).find(tab => tab.url === url);
        if (!tab) throw new Error('The isolated auth test tab was not found');
        await api.tabs.setZoom(tab.id, factor); return api.tabs.getZoom(tab.id);
      }, { factor, url: page.url() });
      expect(actualZoom, 'Chromium tab API must confirm actual browser page zoom').toBeCloseTo(factor, 5);
      await expect.poll(async () => Math.abs((await metrics()).width - baselineMetrics.width / factor),
        { message: 'Native zoom must change CSS viewport dimensions' }).toBeLessThanOrEqual(tolerance);
      const currentMetrics = await metrics();
      expect(currentMetrics.dpr / baselineMetrics.dpr, 'Native zoom must change the device-pixel ratio').toBeCloseTo(factor, 5);
      expect(currentMetrics.visualScale, 'This is page zoom, separate from pinch/visual scaling').toBe(1);
      expect(currentMetrics.bodyZoom, 'No CSS zoom is applied in native browser zoom cases').toBe(1);
      await expect(email).toHaveValue(emailValue); await expect(email).toBeFocused();
      await expect(password).toHaveValue('zoom-presentation-only');
      const bounds = await geometry(page); measurements.push({ method: 'Chromium native tab page zoom', factor, actualZoom, metrics: currentMetrics, bounds });
      assertLayout(bounds, `${locale}/native browser zoom ${factor * 100}%`);
      await assertTextBounds(page, `${locale}/native browser zoom ${factor * 100}%`);
      if ([.85, 2, 4].includes(factor)) await screenshot(page, info, `${locale}-native-browser-zoom-${Math.round(factor * 100)}percent`);
    }
    const reset = await geometry(page);
    for (const [name, box] of Object.entries(baseline.sections)) {
      for (const coordinate of ['x', 'y', 'right', 'bottom', 'width', 'height'] as const) {
        expect(Math.abs(reset.sections[name][coordinate] - box[coordinate]),
          `Zooming back to 100% restores ${name}/${coordinate} within device-pixel rounding`).toBeLessThanOrEqual(tolerance);
      }
    }
    return measurements;
  } finally { await context.close(); }
}

for (const locale of locales) {
  test(`${locale}: studio artwork and form keep their proportions on wide zoom-out viewports`, async ({ page }) => {
    await page.setViewportSize({ width: 1536, height: 1024 }); await open(page, locale);
    const measure = () => page.evaluate(() => {
      const width = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().width;
      return { canvas: width('.auth-visual'), panel: width('.auth-panel'),
        ratio: width('.auth-visual img[alt]:not([alt=""])') / width('.auth-stage-art') };
    });
    const initial = await measure();
    for (const viewport of [{ width: 3072, height: 2048 }, { width: 3830, height: 1750 }]) {
      await page.setViewportSize(viewport); const current = await measure();
      expect(current.canvas, 'Zoom-out must not expand the composed artwork beyond its reference canvas').toBeLessThanOrEqual(1002);
      expect(current.panel, 'Credential entry must remain a bounded reading column').toBeLessThanOrEqual(640);
      expect(current.ratio, 'Characters and learning objects must scale as one scene').toBeCloseTo(initial.ratio, 1);
    }
  });

  test(`${locale}: normal desktop uses the window edges and fits the form and role tray`, async ({ page }) => {
    for (const viewport of [{ width: 1366, height: 600 }, { width: 1536, height: 688 }, { width: 1906, height: 860 }, { width: 1920, height: 864 }, { width: 1536, height: 864 }, { width: 1536, height: 850 }, { width: 1536, height: 851 }, { width: 1882, height: 856 }, { width: 1536, height: 1024 }, { width: 1366, height: 768 }]) {
      await page.setViewportSize(viewport); await open(page, locale);
      const bounds = await page.evaluate(() => {
        const box = (selector: string) => { const r = document.querySelector(selector)!.getBoundingClientRect(); return { x: r.x, right:r.right, bottom:r.bottom, width:r.width }; };
        return { brand:box('.auth-header .brand'), panel:box('.auth-panel'), roles:box('.learning-loop__roles'),
          height:document.documentElement.scrollHeight, trayStyle:(() => { const style=getComputedStyle(document.querySelector('.learning-loop__roles')!); return {background:style.backgroundColor,border:style.borderTopColor,shadow:style.boxShadow}; })() };
      });
      expect(locale === 'en' ? bounds.brand.x : viewport.width-bounds.brand.right).toBeLessThanOrEqual(48);
      expect(locale === 'en' ? viewport.width-bounds.panel.right : bounds.panel.x).toBeLessThanOrEqual(40);
      expect(bounds.panel.width).toBeGreaterThanOrEqual(420);
      expect(bounds.height, `${locale}/${viewport.width}x${viewport.height}: default desktop must fit without vertical scrolling`).toBeLessThanOrEqual(viewport.height+1);
      expect(bounds.roles.bottom).toBeLessThanOrEqual(viewport.height+1);
      expect(bounds.trayStyle, 'Role icons and labels sit directly on the illustrated desk pill without a second surface').toEqual({background:'rgba(0, 0, 0, 0)',border:'rgba(0, 0, 0, 0)',shadow:'none'});
      const artwork = await page.locator('.auth-role-art').evaluateAll(async images => {
        await Promise.all(images.map(image => (image as HTMLImageElement).decode()));
        return images.map(element => {
          const image = element as HTMLImageElement, canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
          const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          return { width: image.getBoundingClientRect().width, corners: [0, canvas.width - 1, (canvas.height - 1) * canvas.width, canvas.width * canvas.height - 1].map(index => pixels[index * 4 + 3]), opaque: pixels.some((value, index) => index % 4 === 3 && value === 255) };
        });
      });
      expect(artwork).toHaveLength(5);
      for (const art of artwork) {
        expect(art.corners, 'Role images have transparent corners rather than white backplates').toEqual([0, 0, 0, 0]);
        expect(art.opaque).toBe(true);
        expect(art.width, 'Role art remains a supporting illustration').toBeLessThanOrEqual(80);
      }
    }
  });

  test(`${locale}: tablet learning labels remain separate from the role tray`, async ({ page }) => {
    for (const width of [768, 941, 1024]) {
      await page.setViewportSize({ width, height: 512 }); await open(page, locale);
      const gap = await page.evaluate(() => {
        const bottom = Math.max(...[...document.querySelectorAll('.learning-loop__stages li')].map(element => element.getBoundingClientRect().bottom));
        return document.querySelector('.learning-loop__roles')!.getBoundingClientRect().top - bottom;
      });
      expect(gap, 'Learning labels and the separate role tray must not overlap').toBeGreaterThanOrEqual(4);
    }
  });

  test(`${locale}: tablet credentials precede the supporting scene`, async ({ page }) => {
    for (const viewport of [{ width: 768, height: 1024 }, { width: 1024, height: 768 }]) {
      await page.setViewportSize(viewport); await open(page, locale);
      const bounds = await geometry(page);
      const email = await page.locator('#email').boundingBox();
      expect(email).not.toBeNull();
      expect(email!.y + email!.height, 'The first credential is visible before scrolling').toBeLessThanOrEqual(viewport.height);
      expect(bounds.sections.panel.y, 'The form follows the introduction').toBeGreaterThanOrEqual(bounds.sections.intro.bottom);
      expect(bounds.sections.visual.y, 'Supporting artwork follows the complete form').toBeGreaterThanOrEqual(bounds.sections.panel.bottom);
      await expect(page.locator('.auth-form')).toHaveCount(1);
      assertLayout(bounds, `${locale}/${viewport.width}: tablet form priority`);
    }
  });

  test(`${locale}: role captions stay separate at native and enlarged text sizes`, async ({ page }) => {
    for (const width of [1366, 1536]) {
      for (const factor of [1, 2]) {
        await page.setViewportSize({ width, height: width === 1366 ? 768 : 1024 }); await open(page, locale);
        if (factor > 1) await page.locator('.auth-page').evaluate((element, size) => {
          const nodes = [...element.querySelectorAll<HTMLElement>('*')];
          const fonts = nodes.map(node => parseFloat(getComputedStyle(node).fontSize));
          nodes.forEach((node, index) => { node.style.fontSize = `${fonts[index] * size}px`; });
        }, factor);
        const captions = await page.locator('.learning-loop__roles > div > span > span').evaluateAll(elements => elements.map(element => {
          const r = element.getBoundingClientRect();
          return { text: element.textContent, x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
        }));
        expect(captions).toHaveLength(5);
        for (let i = 0; i < captions.length; i++) {
          expect(captions[i].scrollWidth, `${captions[i].text}: caption stays within its lane`).toBeLessThanOrEqual(captions[i].clientWidth + 2);
          for (const next of captions.slice(i + 1)) expect(intersects(captions[i], next), `${captions[i].text} and ${next.text} remain separate`).toBe(false);
          if (factor === 1) expect(Math.abs(captions[i].y - captions[0].y), 'Normal text retains the five-role row').toBeLessThanOrEqual(tolerance);
        }
      }
    }
  });

  test(`${locale}: normal flow stays anchored when height, help and privacy change`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1440, height: 900 }); await open(page, locale);
    const measurements = [];
    for (const width of [1440, 900, 390]) {
      await page.setViewportSize({ width, height: 450 });
      const short = await geometry(page);
      await page.setViewportSize({ width, height: 1200 });
      const tall = await geometry(page);
      measurements.push({ width, short, tall });
      assertLayout(short, `${locale}/${width}: short normal flow`);
      assertLayout(tall, `${locale}/${width}: tall normal flow`);
      for (const section of ['header', 'story', 'intro', 'visual', 'panel'] as const) {
        // The selected Studio composition has an intentional compact-height
        // mode. Anchoring remains invariant within a mode; all short/tall
        // layouts are still checked above for overlap and reachable content.
        if(width>1100&&short.viewport.height<=850&&tall.viewport.height>850)continue;
        expect.soft(Math.abs(tall.sections[section].y - short.sections[section].y),
          `${locale}/${width}: ${section} must not move when only viewport height changes`).toBeLessThanOrEqual(tolerance);
      }
      await page.locator('.auth-panel__tabs button').nth(1).click();
      const help = await geometry(page); measurements.push({ width, help });
      assertLayout(help, `${locale}/${width}: account help`);
      for (const section of ['header', 'story', 'intro', 'panel'] as const) {
        expect.soft(Math.abs(help.sections[section].y - tall.sections[section].y),
          `${locale}/${width}: opening account help must not lift preceding ${section}`).toBeLessThanOrEqual(tolerance);
      }
      await page.locator('.auth-panel__tabs button').first().click();
      const closed = await geometry(page);
      await page.locator('.auth-privacy-trigger').click();
      const privacy = await geometry(page); measurements.push({ width, privacy });
      assertLayout(privacy, `${locale}/${width}: privacy expanded`);
      for (const section of ['header', 'story', 'intro', 'visual', 'panel'] as const) {
        if (section === 'visual' && width >= 768 && width <= 1100) {
          // Optional privacy uses a dialog and leaves the following scene fixed.
          const movement = privacy.sections.visual.y - closed.sections.visual.y;
          expect.soft(movement, `${locale}/${width}: expanded privacy cannot lift the following scene`).toBeGreaterThanOrEqual(-tolerance);
          expect.soft(Math.abs(movement - (privacy.sections.panel.bottom - closed.sections.panel.bottom)),
            `${locale}/${width}: following scene tracks form expansion`).toBeLessThanOrEqual(tolerance);
          continue;
        }
        expect.soft(Math.abs(privacy.sections[section].y - closed.sections[section].y),
          `${locale}/${width}: opening footer privacy must not lift preceding ${section}`).toBeLessThanOrEqual(tolerance);
      }
      await page.keyboard.press('Escape');
    }
    await evidence(info, 'normal-flow-measurements', measurements);
  });

  test(`${locale}: native browser zoom 85–400%, equivalent reflow and breakpoint boundaries`, async ({ page, baseURL }, info) => {
    const measurements = [];
    await open(page, locale);
    // A 1280x900 browser content area at these zoom factors has these CSS dimensions.
    // Resizing verifies the resulting reflow, without claiming browser zoom occurred.
    for (const percent of [85, 100, 110, 125, 150, 175, 200, 250, 300, 400]) {
      const viewport = { width: Math.round(1280 * 100 / percent), height: Math.round(900 * 100 / percent) };
      await page.setViewportSize(viewport);
      const bounds = await geometry(page); measurements.push({ percent, method: 'equivalent viewport reflow', bounds });
      assertLayout(bounds, `${locale}/${percent}% equivalent viewport`);
      await assertTextBounds(page, `${locale}/${percent}% equivalent viewport`);
      if ([85, 100, 200, 400].includes(percent)) await screenshot(page, info, `${locale}-reflow-equivalent-${percent}percent`);
    }
    for (const width of [1440, 1280, 1201, 1200, 1101, 1100, 1024, 1001, 1000, 901, 900, 769, 768, 767, 390, 381, 380, 320]) {
      await page.setViewportSize({ width, height: 800 });
      const bounds = await geometry(page); measurements.push({ method: 'breakpoint boundary', bounds });
      assertLayout(bounds, `${locale}/${width}px boundary`);
    }
    const native = await nativeZoom(info, locale, baseURL!);
    await evidence(info, 'native-zoom-equivalent-reflow-and-boundaries', { viewportReflow: measurements, native });
  });

  test(`${locale}: CSS zoom and 200% text enlargement keep content usable`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1280, height: 900 }); await open(page, locale);
    const measurements = [];
    for (const zoom of [.85, 1.25, 2]) {
      await page.evaluate(value => { document.body.style.zoom = String(value); }, zoom);
      expect(await page.evaluate(() => Number(getComputedStyle(document.body).zoom))).toBe(zoom);
      const bounds = await geometry(page); measurements.push({ method: 'CSS zoom', zoom, bounds });
      assertLayout(bounds, `${locale}/CSS zoom ${zoom}`);
      await assertTextBounds(page, `${locale}/CSS zoom ${zoom}`);
      if (zoom === 2) await screenshot(page, info, `${locale}-css-zoom-200percent`);
    }
    await page.evaluate(() => { document.body.style.zoom = ''; });
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => {
        // Magnify font metrics only, leaving spacing and viewport dimensions unchanged.
        // This is text-only enlargement, separate from root-rem growth or CSS zoom.
        const nodes = [...document.querySelectorAll<HTMLElement>('.auth-page *')];
        const sizes = nodes.map(element => parseFloat(getComputedStyle(element).fontSize));
        nodes.forEach((element, index) => { element.dataset.layoutTestFont = element.style.fontSize; element.style.fontSize = `${sizes[index] * 2}px`; });
      });
      const bounds = await geometry(page); measurements.push({ method: 'text-only enlargement', percent: 200, width, bounds });
      assertLayout(bounds, `${locale}/${width}px text-only 200%`);
      await assertTextBounds(page, `${locale}/${width}px text-only 200%`);
      await screenshot(page, info, `${locale}-text-enlargement-200percent-${width}`);
      await page.evaluate(() => document.querySelectorAll<HTMLElement>('[data-layout-test-font]').forEach(element => {
        element.style.fontSize = element.dataset.layoutTestFont ?? ''; delete element.dataset.layoutTestFont;
      }));
    }
    await evidence(info, 'css-zoom-and-text-enlargement', measurements);
  });

  test(`${locale}: short landscape keyboard, long email and resize preserve the form`, async ({ page }, info) => {
    const longEmail = `${'school.account'.repeat(10)}@example.invalid`;
    const passwordValue = 'presentation-only-password';
    const measurements = [];
    await page.setViewportSize({ width: 844, height: 450 }); await open(page, locale);
    const email = page.locator('#email'), password = page.locator('#password');
    await expect(email).toHaveAttribute('autocomplete', 'username');
    await expect(password).toHaveAttribute('autocomplete', 'current-password');
    // Synthetic autofill-like content; native password manager UI is not being claimed.
    await email.fill(longEmail); await password.fill(passwordValue);
    for (const height of [450, 320]) {
      await page.setViewportSize({ width: 844, height });
      await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); scrollTo(0, 0); });
      for (const selector of ['#email', '#password', '.password-toggle', '.auth-submit']) await keyboardReach(page, selector);
      const bounds = await geometry(page); measurements.push({ height, bounds });
      assertLayout(bounds, `${locale}/landscape ${height}px`);
      await screenshot(page, info, `${locale}-short-landscape-${height}`);
    }
    await email.focus();
    for (const viewport of [{ width: 320, height: 568 }, { width: 1510, height: 1059 }, { width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await expect(email).toBeFocused(); await expect(email).toHaveValue(longEmail); await expect(password).toHaveValue(passwordValue);
      await expect(email).toHaveAttribute('dir', 'ltr');
      const bounds = await geometry(page); measurements.push({ viewport, bounds }); assertLayout(bounds, `${locale}/resize ${viewport.width}`);
    }
    await evidence(info, 'keyboard-and-resize', measurements);
  });

  test(`${locale}: artwork decodes with transparent edges and stays stable through resize`, async ({ page }, info) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 900 }); await open(page, locale);
    const art = page.locator('.auth-companions__image');
    await expect.poll(() => art.evaluate(element => {
      const image = element as HTMLImageElement; return image.complete && image.naturalWidth > 0;
    })).toBe(true);
    const alpha = await art.evaluate(element => {
      const image = element as HTMLImageElement;
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let transparent = 0, opaque = 0;
      for (let i = 3; i < pixels.length; i += 4) { if (pixels[i] === 0) transparent++; if (pixels[i] === 255) opaque++; }
      const corners = [[0, 0], [canvas.width - 1, 0], [0, canvas.height - 1], [canvas.width - 1, canvas.height - 1]]
        .map(([x, y]) => pixels[(y * canvas.width + x) * 4 + 3]);
      return { width: canvas.width, height: canvas.height, transparent, opaque, corners };
    });
    expect(alpha.transparent, 'Welcome artwork must have actual transparent pixels').toBeGreaterThan(0);
    expect(alpha.opaque, 'Welcome artwork must contain visible artwork').toBeGreaterThan(0);
    expect(alpha.corners, 'Transparent corners avoid a rectangular picture backdrop').toEqual([0, 0, 0, 0]);
    const measurements = [];
    for (const width of [1440, 900, 390, 320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => art.evaluate(element => (element as HTMLImageElement).currentSrc)).toMatch(width < 768 ? /welcome-fox\./ : /studio-companions\./);
      await expect.poll(() => art.evaluate(element => {
        const image = element as HTMLImageElement; return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
      })).toBe(true);
      await expect.poll(() => art.evaluate(async element => {
        try { await (element as HTMLImageElement).decode(); return true; } catch { return false; }
      }), { message: 'The newly selected responsive image must finish decoding' }).toBe(true);
      const bounds = await geometry(page);
      const image = await art.evaluate(element => {
        const image = element as HTMLImageElement, r = image.getBoundingClientRect();
        const scene = image.closest('.auth-companions__scene')!.getBoundingClientRect();
        const visual = image.closest('.auth-visual')!.getBoundingClientRect();
        return { width: r.width, height: r.height, naturalRatio: image.naturalWidth / image.naturalHeight, source: image.currentSrc, fit: getComputedStyle(image).objectFit, mask: getComputedStyle(image).maskImage, insideScene: r.left >= scene.left - 1 && r.right <= scene.right + 1 && r.top >= scene.top - 1 && r.bottom <= scene.bottom + 1, insideVisual: r.left >= visual.left - 1 && r.right <= visual.right + 1 && r.top >= visual.top - 1 && r.bottom <= visual.bottom + 1 };
      });
      expect.soft(image.fit, `${locale}/${width}: the whole character or desktop pair is contained`).toBe('contain');
      if (width < 768) {
        expect.soft(image.mask, 'The full mobile character has no fading mask').toBe('none');
        expect.soft(image.width / image.height, 'Mobile retains the full portrait rather than a square crop').toBeCloseTo(image.naturalRatio, 2);
        expect.soft(image.insideVisual, 'The mobile container cannot clip Foxi’s feet or tail').toBe(true);
      }
      expect.soft(image.insideScene, `${locale}/${width}: poster remains inside its bounded scene`).toBe(true);
      measurements.push({ width, bounds, image });
      assertLayout(bounds, `${locale}/${width}: decoded artwork`);
    }
    expect.soft(measurements[4].bounds.sections.visual, 'Returning to original width restores illustration geometry')
      .toEqual(measurements[0].bounds.sections.visual);
    expect(errors).toEqual([]);
    await evidence(info, 'image-alpha-and-resize', { alpha, measurements });
  });
}
