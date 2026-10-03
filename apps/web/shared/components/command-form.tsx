'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { Button } from '@cuevo/ui';
import { confirmCommandReceipt, LearningApiError } from '../api/client';
import { useApi } from '../hooks/use-api';
import { LearningError } from './feedback';
import { useApp } from '../session/providers';
import type { FormValues } from '../session/form-drafts';

export type FormField = { name: string; label: string; type?: 'text' | 'textarea' | 'number' | 'date' | 'time' | 'datetime-local' | 'select' | 'checkbox'; required?: boolean; options?: { value: string; label: string }[]; defaultValue?: string | number; defaultChecked?: boolean; maxLength?: number; min?: number; max?: number; step?: number | 'any' };

export function CommandForm({ title, regionLabel, asRegion=true, path, fields, body, onSaved, onCancel, note, actionLabel, draftKey, onValuesChange, onLockedChange }: { title: string; regionLabel?:string; asRegion?:boolean; path: string; fields: FormField[]; body: (values: FormData) => Record<string, unknown>; onSaved: (result: unknown) => void; onCancel?: () => void; note?: string; actionLabel?: string; draftKey?: string; onValuesChange?: (values: FormData) => void; onLockedChange?: (locked: boolean) => void }) {
  const { request, journal, t } = useApi();
  const journalRevision = useSyncExternalStore(journal.subscribe, journal.getSnapshot, journal.getSnapshot);
  const { membership, formDrafts, announce, accessToken, online } = useApp();
  const idPrefix = useId();
  const errorId = `${idPrefix}-error`;
  const slot = path;
  const workingSlot = `${membership?.schoolId}:${membership?.userId}:${draftKey ?? path}`;
  const scope = `${workingSlot}:${accessToken ?? ''}:${online}`;
  const currentScope = useRef(scope); currentScope.current = scope;
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const working = formDrafts.get(workingSlot);
  const retained = journal.get(slot);
  const recoveryKey = useRef(retained?.key);
  const [pending, setPending] = useState(false);
  const [, setInputRevision] = useState(0);
  const [formRevision, setFormRevision] = useState(0);
  const [error, setError] = useState<LearningApiError | null>(() => retained ? new LearningApiError('unavailable', true) : null);
  useEffect(() => { if (recoveryKey.current && !retained) { recoveryKey.current = undefined; setError(current => current?.uncertain ? null : current); } }, [journalRevision, retained]);
  const locked = pending || !!error?.uncertain;
  useEffect(() => { onLockedChange?.(locked); return () => onLockedChange?.(false); }, [locked, onLockedChange]);
  async function send(values?: FormData) {
    if (pending) return;
    setPending(true); setError(null);
    const expectedScope = scope; let commandKey: string | undefined;
    const ownsCommand = () => mounted.current && currentScope.current === expectedScope && (!commandKey || journal.get(slot)?.key === commandKey);
    try {
      const payload = values ? body(values) : null;
      const basis = formDrafts.get(workingSlot)?.basis ?? {};
      const command = values && payload ? journal.prepare(slot, path, { ...payload, ...Object.fromEntries(Object.entries(basis).filter(([key]) => /^expected(?:Revision|Version|PolicyVersion|AvailabilityVersion)$/.test(key) && key in payload)) }) : journal.get(slot);
      if (!command) throw new LearningApiError('invalid');
      commandKey = command.key;
      recoveryKey.current = command.key;
      const submittedDraft = formDrafts.get(workingSlot);
      const result = await request(path, { command });
      if (!confirmCommandReceipt(journal, slot, command.key, result, ownsCommand() ? onSaved : undefined)) return;
      if (!mounted.current || currentScope.current !== expectedScope) return;
      if (formDrafts.consume(workingSlot, submittedDraft)) { setInputRevision(value => value + 1); setFormRevision(value => value + 1); }
      announce(`${title}: ${t.saved}`);
    } catch (failure) {
      const safe = failure instanceof LearningApiError ? failure : new LearningApiError('invalid');
      const canPublishError = ownsCommand();
      if (!safe.uncertain && commandKey) journal.confirm(slot, commandKey);
      if (!canPublishError) return;
      setError(safe);
    } finally { if (mounted.current && currentScope.current === expectedScope) setPending(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void send(new FormData(event.currentTarget)); }
  function remember(form: HTMLFormElement) {
    const values = new FormData(form); const workingValues: FormValues = {};
    for (const field of fields) workingValues[field.name] = field.type === 'checkbox' ? values.get(field.name) === 'on' : String(values.get(field.name) ?? '');
    let basis = formDrafts.get(workingSlot)?.basis;
    if (!basis || !Object.keys(basis).length) {
      try { basis = Object.fromEntries(Object.entries(body(values)).filter(([key]) => /^expected(?:Revision|Version|PolicyVersion|AvailabilityVersion)$/.test(key) && !fields.some(field => field.name === key))); } catch { basis = {}; }
    }
    formDrafts.save(workingSlot, workingValues, basis);
    setInputRevision(value => value + 1);
    onValuesChange?.(values);
  }
  return <section className="learning-form" aria-label={asRegion?regionLabel??title:undefined}><h3>{title}</h3>{note ? <p className="learning-form__note">{note}</p> : null}<form key={formRevision} onSubmit={submit} onChange={event => remember(event.currentTarget)} aria-busy={pending}><fieldset disabled={locked}><div className="learning-form__fields">{fields.map((field) => {
    const id = `${idPrefix}-${field.name}`;
    const retainedValue = retained?.body[field.name];
    const workingValue = working?.values[field.name];
    const defaultValue = typeof retainedValue === 'string' || typeof retainedValue === 'number' ? retainedValue : typeof workingValue === 'string' ? workingValue : field.defaultValue;
    if (field.type === 'checkbox') return <div className="field field--wide checkbox-field" key={field.name}><input id={id} name={field.name} aria-describedby={error ? errorId : undefined} type="checkbox" required={field.required} defaultChecked={typeof retainedValue==='boolean'?retainedValue:typeof workingValue==='boolean'?workingValue:field.defaultChecked??false} /><label htmlFor={id}>{field.label}</label></div>;
    return <div className={`field ${field.type === 'textarea' ? 'field--wide' : ''}`} key={field.name}><label htmlFor={id}>{field.label}</label>{field.type === 'select' ? <select id={id} name={field.name} aria-describedby={error ? errorId : undefined} required={field.required} value={defaultValue ?? ''} onChange={() => undefined}><option value="">{t.choose}</option>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.type === 'textarea' ? <textarea id={id} name={field.name} aria-describedby={error ? errorId : undefined} required={field.required} defaultValue={defaultValue} maxLength={field.maxLength ?? 10_000} rows={5} /> : <input id={id} name={field.name} aria-describedby={error ? errorId : undefined} type={field.type ?? 'text'} required={field.required} defaultValue={defaultValue} min={field.min} max={field.max} maxLength={field.maxLength ?? 200} step={field.type === 'number' ? field.step ?? 1 : field.type === 'time' || field.type === 'datetime-local' ? field.step : undefined} />}</div>;
  })}</div></fieldset>{error ? <LearningError error={error} id={errorId} /> : null}<div className="learning-form__actions">{error?.uncertain ? <Button type="button" disabled={pending} onClick={() => void send()}>{pending ? t.saving : t.retrySame}</Button> : <Button type="submit" disabled={pending}>{pending ? t.saving : actionLabel ?? t.save}</Button>}{onCancel && !error?.uncertain ? <Button type="button" variant="quiet" onClick={() => { formDrafts.remove(workingSlot); onCancel(); }} disabled={pending}>{t.cancel}</Button> : null}</div></form></section>;
}
