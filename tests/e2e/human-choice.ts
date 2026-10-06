import { expect, type Locator } from '@playwright/test';

/** Select the one visible human label, then verify its independently known source identity. */
export async function selectHumanChoice(select: Locator, label: string | RegExp, expectedValue?: string, sourcePaging?: Locator): Promise<{ label: string; value: string }> {
  await expect(select).toBeVisible();
  await expect(select).toBeEnabled();
  const choice = select.getByRole('option', { name: label, exact: true });
  if (sourcePaging) for (let page = 0; page < 30 && !await choice.count(); page++) {
    const more = sourcePaging.getByRole('button', { name: 'Load more', exact: true });
    await expect.poll(async () => await choice.count() > 0 || await more.count() > 0).toBe(true);
    if (await choice.count()) break;
    await expect(more, 'Paging belongs to exactly this authorized source').toHaveCount(1);
    await more.click();
    await expect(sourcePaging.getByRole('button', { name: 'Loading more…', exact: true })).toHaveCount(0);
  }
  await expect(choice, 'One authorized human source label must identify this choice').toHaveCount(1);
  await expect(choice).toBeEnabled();
  const visibleLabel = (await choice.textContent() ?? '').trim();
  const value = await choice.getAttribute('value');
  expect(visibleLabel.length, 'The source has a nonempty human label').toBeGreaterThan(0);
  expect(visibleLabel.length, 'The source label is bounded').toBeLessThanOrEqual(1000);
  expect(value, 'The named source has a nonempty record value').not.toBeNull();
  expect(value!.length).toBeGreaterThan(0);
  if (expectedValue !== undefined) expect(value, 'The visible source matches its known receipt').toBe(expectedValue);
  await select.selectOption({ label: visibleLabel });
  await expect(select).toHaveValue(value!);
  await expect(select.locator('option:checked')).toHaveText(visibleLabel);
  return { label: visibleLabel, value: value! };
}

/** A bounded literal source prefix; contextual suffixes must be visibly separated. */
export function humanContextLabel(title: string): RegExp {
  return new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?: · [^\\r\\n]{1,800})?$`);
}
