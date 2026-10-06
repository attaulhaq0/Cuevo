export function versionLabel(value: string, locale: string): string {
  const generated = value.startsWith('school-') ? value.slice(7) : '';
  return generated && Number.isFinite(Date.parse(generated)) ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(generated)) : value;
}
