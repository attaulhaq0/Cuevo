'use client';

import { useId, useState, type FormEvent } from 'react';
import { Button } from '@cuevo/ui';
import { LearningApiError } from '../../lib/learning-api';
import { useLearningApi } from './use-learning';
import { LearningError } from './feedback';

export type FormField = { name: string; label: string; type?: 'text' | 'textarea' | 'number' | 'datetime-local' | 'select'; required?: boolean; options?: { value: string; label: string }[]; defaultValue?: string | number; maxLength?: number; min?: number; max?: number; step?: number | 'any' };

export function CommandForm({ title, path, fields, body, onSaved, onCancel, note, actionLabel }: { title: string; path: string; fields: FormField[]; body: (values: FormData) => Record<string, unknown>; onSaved: () => void; onCancel?: () => void; note?: string; actionLabel?: string }) {
  const { request, journal, t } = useLearningApi();
  const idPrefix = useId();
  const slot = path;
  const retained = journal.get(slot);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<LearningApiError | null>(() => retained ? new LearningApiError('unavailable', true) : null);
  const locked = pending || !!error?.uncertain;
  async function send(values?: FormData) {
    if (pending) return;
    setPending(true); setError(null);
    try {
      const command = values ? journal.prepare(slot, path, body(values)) : journal.get(slot);
      if (!command) throw new LearningApiError('invalid');
      const result = await request(path, { command });
      if (typeof result !== 'object' || !result || !('id' in result) || typeof result.id !== 'string') throw new LearningApiError('invalid', true);
      journal.confirm(slot); onSaved();
    } catch (failure) {
      const safe = failure instanceof LearningApiError ? failure : new LearningApiError('invalid');
      if (!safe.uncertain) journal.confirm(slot);
      setError(safe);
    } finally { setPending(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void send(new FormData(event.currentTarget)); }
  return <section className="learning-form" aria-label={title}><h3>{title}</h3>{note ? <p className="learning-form__note">{note}</p> : null}<form onSubmit={submit} aria-busy={pending}><fieldset disabled={locked}><div className="learning-form__fields">{fields.map((field) => {
    const id = `${idPrefix}-${field.name}`;
    const retainedValue = retained?.body[field.name];
    const defaultValue = typeof retainedValue === 'string' || typeof retainedValue === 'number' ? retainedValue : field.defaultValue;
    return <div className={`field ${field.type === 'textarea' ? 'field--wide' : ''}`} key={field.name}><label htmlFor={id}>{field.label}</label>{field.type === 'select' ? <select id={id} name={field.name} required={field.required} defaultValue={defaultValue ?? ''}><option value="">{t.choose}</option>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.type === 'textarea' ? <textarea id={id} name={field.name} required={field.required} defaultValue={defaultValue} maxLength={field.maxLength ?? 10_000} rows={5} /> : <input id={id} name={field.name} type={field.type ?? 'text'} required={field.required} defaultValue={defaultValue} min={field.min} max={field.max} maxLength={field.maxLength ?? 200} step={field.type === 'number' ? field.step ?? 1 : undefined} />}</div>;
  })}</div></fieldset>{error ? <LearningError error={error} /> : null}<div className="learning-form__actions">{error?.uncertain ? <Button type="button" disabled={pending} onClick={() => void send()}>{pending ? t.saving : t.retrySame}</Button> : <Button type="submit" disabled={pending}>{pending ? t.saving : actionLabel ?? t.save}</Button>}{onCancel && !error?.uncertain ? <Button type="button" variant="quiet" onClick={onCancel} disabled={pending}>{t.cancel}</Button> : null}</div></form></section>;
}
