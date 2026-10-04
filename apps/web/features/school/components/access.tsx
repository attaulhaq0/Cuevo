'use client';
import { useState, useSyncExternalStore } from 'react';
import { Button, CuevoIcon, Status } from '@cuevo/ui';
import { schoolAccessRevision, schoolAccessBasis, schoolAccessSourceKey, type SchoolPerson, type SchoolRow } from '../model';
import { useApp } from '../../../shared/session/providers';
import { CommandForm, type FormField } from '../../../shared/components/command-form';
import { schoolAr, schoolEn } from '../messages';
import { AccessDirectory } from './access-directory';
import { accessDirectoryRows, currentAccessDirectoryRow, currentAccessPerson, filterAccessDirectory, recoveredAccessRelationship, type AccessDirectoryKind, type AccessDirectoryRow } from '../access-directory-model';
import { accessDirectoryEn, accessDirectoryAr } from '../access-directory-messages';
import { LearningApiError } from '../../../shared/api/client';
export function SchoolAccess({ people, enrollments, assignments, guardians, classes, subjects, canManage, onChanged }: { people: SchoolPerson[]; enrollments: SchoolRow[]; assignments: SchoolRow[]; guardians: SchoolRow[]; classes: SchoolRow[]; subjects: SchoolRow[]; canManage: boolean; onChanged: () => void }) {
  const { locale, dictionary, membership, formDrafts, commandJournal } = useApp(); const t = locale === 'ar' ? schoolAr : schoolEn;
  const copy = locale === 'ar' ? accessDirectoryAr : accessDirectoryEn;
  useSyncExternalStore(commandJournal.subscribe, commandJournal.getSnapshot, commandJournal.getSnapshot);
  const prefix = `${membership?.schoolId}:${membership?.userId}:/v1/school/`;
  const retainedPerson = people.find(row => commandJournal.get(`/v1/school/people/${row.id}/configure`) || formDrafts.get(`${prefix}people/${row.id}/configure`));
  const retainedAction = retainedPerson ? 'person' : commandJournal.get('/v1/school/enrollments') || formDrafts.get(`${prefix}enrollments`) ? 'enrollment' : commandJournal.get('/v1/school/teacher-assignments') || formDrafts.get(`${prefix}teacher-assignments`) ? 'assignment' : commandJournal.get('/v1/school/guardian-relationships') || formDrafts.get(`${prefix}guardian-relationships`) ? 'guardian' : null;
  const [action, setAction] = useState<'person' | 'enrollment' | 'assignment' | 'guardian' | null>(retainedAction); const [personId, setPersonId] = useState(retainedPerson?.id ?? '');
  const [relationship, setRelationship] = useState<SchoolRow | null>(() => {
    if (!retainedAction || retainedAction === 'person') return null;
    const path = retainedAction === 'enrollment' ? '/v1/school/enrollments' : retainedAction === 'assignment' ? '/v1/school/teacher-assignments' : '/v1/school/guardian-relationships';
    return recoveredAccessRelationship(retainedAction, commandJournal.get(path)?.body ?? formDrafts.get(`${membership?.schoolId}:${membership?.userId}:${path}`)?.values ?? {}, retainedAction === 'enrollment' ? enrollments : retainedAction === 'assignment' ? assignments : guardians);
  });
  const [directoryKind, setDirectoryKind] = useState<AccessDirectoryKind>(retainedAction ?? 'person');
  const [query, setQuery] = useState(''); const [selectedId, setSelectedId] = useState<string | null>(retainedPerson?.id ?? relationship?.id ?? null);
  const [locked, setLocked] = useState(false);
  const [reviewedPerson, setReviewedPerson] = useState<SchoolPerson | null>(retainedAction === 'person' ? retainedPerson ?? null : null);
  const pending = commandJournal.pending().some(command => /^\/v1\/school\/(people\/|enrollments$|teacher-assignments$|guardian-relationships$)/.test(command.path));
  const selectionLocked = locked || pending;
  const currentPerson = currentAccessPerson(people, personId);
  const person = action === 'person' && reviewedPerson ? reviewedPerson : currentPerson;
  const names = Object.fromEntries([...people.map(row => [row.id, row.displayName]), ...classes.map(row => [row.id, typeof row.name === 'string' ? row.name : t.nameUnavailable]), ...subjects.map(row => [row.id, typeof row.name === 'string' ? row.name : t.nameUnavailable])]);
  const choices = (rows: SchoolRow[]) => rows.map(row => ({ value: row.id, label: typeof (row.displayName ?? row.name) === 'string' && String(row.displayName ?? row.name).trim() ? String(row.displayName ?? row.name) : t.nameUnavailable }));
  const select = (name: string, label: string, rows: SchoolRow[]): FormField => ({ name, label, type: 'select', required: true, options: choices(rows) });
  const local = (value: string | null | undefined) => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '';
  const windows: FormField[] = [{ name: 'effectiveFrom', label: t.effectiveFrom, type: 'datetime-local', required: true, defaultValue: action === 'person' ? local(person?.effectiveFrom) : undefined }, { name: 'effectiveTo', label: t.effectiveTo, type: 'datetime-local', defaultValue: action === 'person' ? local(person?.effectiveTo) : undefined }, { name: 'confirmAccessChange', label: t.confirmAccess, type: 'checkbox', required: true }];
  const status = (states: string[]): FormField => ({ name: 'status', label: t.status, type: 'select', required: true, defaultValue: action === 'person' ? person?.status : undefined, options: states.map(value => ({ value, label: value === 'active' ? t.active : value === 'revoked' ? t.revoked : value === 'suspended' ? t.suspended : value === 'completed' ? t.completed : t.pending })) });
  const fields: Record<string, FormField[]> = { person: [{ name: 'displayName', label: t.name, required: true, defaultValue: person?.displayName }, { name: 'role', label: t.role, type: 'select', required: true, defaultValue: person?.role, options: ['admin', 'coordinator', 'teacher', 'student', 'parent'].map(role => ({ value: role, label: dictionary.roles[role as SchoolPerson['role']] })) }, status(['active', 'suspended', 'revoked']), ...windows], enrollment: [select('classId', t.class, classes), select('studentId', t.student, people.filter(row => row.role === 'student')), status(['active', 'revoked', 'completed']), ...windows], assignment: [select('classId', t.class, classes), select('subjectId', t.subject, subjects), select('teacherId', t.teacher, people.filter(row => row.role === 'teacher')), status(['active', 'revoked']), ...windows], guardian: [select('parentId', t.parent, people.filter(row => row.role === 'parent')), select('studentId', t.student, people.filter(row => row.role === 'student')), { name: 'relationshipType', label: t.relationship, type: 'select', required: true, options: [{ value: 'parent', label: t.parent }, { value: 'guardian', label: t.guardian }] }, status(['active', 'revoked', 'pending']), ...windows] };
  if (relationship && action && action !== 'person') for (const field of fields[action]) {
    const value = relationship[field.name];
    if (field.name === 'effectiveFrom' || field.name === 'effectiveTo') field.defaultValue = local(typeof value === 'string' ? value : null);
    else if (typeof value === 'string') field.defaultValue = value;
  }
  const titles = { person: t.configurePerson, enrollment: t.enrollment, assignment: t.assignment, guardian: t.guardian }; const paths = { person: `/v1/school/people/${personId}/configure`, enrollment: '/v1/school/enrollments', assignment: '/v1/school/teacher-assignments', guardian: '/v1/school/guardian-relationships' };
  const statusLabel = (value: unknown) => value === 'active' ? t.active : value === 'suspended' ? t.suspended : value === 'revoked' ? t.revoked : value === 'completed' ? t.completed : value === 'pending' ? t.pending : t.nameUnavailable;
  const dateLabel = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
  const accessRows = {person: people, enrollment: enrollments, assignment: assignments, guardian: guardians};
  function accessBody(values: FormData) {
    if (!action) return {};
    if (relationship && !accessRows[action].some(row => row.id === relationship.id && row.revision === relationship.revision) && !commandJournal.get(paths[action])) throw new LearningApiError('conflict');
    if (action === 'person' && currentPerson?.revision !== person?.revision && !commandJournal.get(paths.person)) throw new LearningApiError('conflict');
    const input = Object.fromEntries(fields[action].map(field => [field.name, field.name === 'confirmAccessChange' ? values.get(field.name) === 'on' : field.name === 'effectiveFrom' ? relationship && String(values.get(field.name)) === local(String(relationship.effectiveFrom)) ? relationship.effectiveFrom : action === 'person' && String(values.get(field.name)) === local(person?.effectiveFrom) ? person!.effectiveFrom : new Date(String(values.get(field.name))).toISOString() : field.name === 'effectiveTo' ? relationship && String(values.get(field.name)) === local(typeof relationship.effectiveTo === 'string' ? relationship.effectiveTo : null) ? relationship.effectiveTo : action === 'person' && String(values.get(field.name)) === local(person?.effectiveTo) ? person!.effectiveTo : values.get(field.name) ? new Date(String(values.get(field.name))).toISOString() : null : String(values.get(field.name))]));
    const revision = schoolAccessRevision(action, input, accessRows[action], personId);
    if (revision !== undefined) input.expectedRevision = revision;
    return input;
  }
  const currentRows = accessRows[directoryKind];
  const recordRows = accessDirectoryRows(directoryKind, currentRows, names, dictionary.roles, t.nameUnavailable);
  const selected = currentAccessDirectoryRow(recordRows, selectedId);
  const editingCurrent = action !== 'person' && relationship ? accessRows[action ?? 'enrollment'].filter(row => row.id === relationship.id) : [];
  const personBasis = action === 'person' ? formDrafts.get(`${membership?.schoolId}:${membership?.userId}:${paths.person}`)?.basis.expectedRevision : undefined;
  const sourceCurrent = action === 'person' ? !!currentPerson && currentPerson.revision === person?.revision && (personBasis === undefined || personBasis === currentPerson.revision) : !relationship || editingCurrent.length === 1 && editingCurrent[0].revision === relationship.revision;
  function chooseKind(kind: AccessDirectoryKind) { if (selectionLocked) return; setDirectoryKind(kind); setSelectedId(null); setQuery(''); setAction(null); setRelationship(null); }
  function chooseRecord(row: AccessDirectoryRow) {
    if (selectionLocked) return;
    setSelectedId(row.id); setAction(null);
    if (directoryKind === 'person') { setPersonId(row.id); setRelationship(null); } else setRelationship(row.source);
  }
  function editSelected() { if (!selected || selectionLocked) return; if (directoryKind === 'person') { setPersonId(selected.id); setReviewedPerson(currentAccessPerson(people, selected.id) ?? null); } else setRelationship(selected.source); setAction(directoryKind); }
  function createRelationship() { if (selectionLocked || directoryKind === 'person') return; setRelationship(null); setSelectedId(null); setAction(directoryKind); }
  return <div className="school-access-workspace">
    <header className="cuevo-section-header"><div className="cuevo-section-header__context"><h2>{copy.title}</h2><p>{copy.body}</p></div><details className="school-access-help"><summary>{copy.note}</summary><p>{t.accessNote}</p></details></header>
    <div className="school-access-layout">
      <AccessDirectory locale={locale} kind={directoryKind} rows={filterAccessDirectory(recordRows, query, locale)} selectedId={selectedId} query={query} locked={selectionLocked} statusLabel={statusLabel} onKind={chooseKind} onQuery={setQuery} onSelect={chooseRecord}/>
      <section className="school-access-selected" aria-label={copy.selected}>
        {selected ? <><header className="cuevo-section-header"><div className="cuevo-section-header__context"><h2><CuevoIcon name="person" size={28}/><bdi>{selected.title}</bdi></h2><p><bdi>{selected.context}</bdi></p></div><Status tone={selected.status === 'active' ? 'positive' : 'neutral'}>{statusLabel(selected.status)}</Status></header><dl className="school-access-facts"><div><dt>{copy.from}</dt><dd><bdi>{dateLabel(selected.source.effectiveFrom)}</bdi></dd></div><div><dt>{copy.to}</dt><dd><bdi>{selected.source.effectiveTo === null ? copy.ongoing : dateLabel(selected.source.effectiveTo)}</bdi></dd></div></dl>{canManage && !action ? <Button type="button" variant="secondary" disabled={selectionLocked} onClick={editSelected}>{copy.edit}</Button> : null}</> : action ? null : <><h2>{copy.choose}</h2><p>{selectedId ? copy.sourceUnavailable : copy.chooseBody}</p></>}
        {canManage && directoryKind !== 'person' && !action ? <Button type="button" variant="secondary" disabled={selectionLocked} onClick={createRelationship}>{copy.create}</Button> : null}
        {canManage && action && (action !== 'person' || person) && (sourceCurrent || !!commandJournal.get(paths[action])) ? <CommandForm key={`${action}:${relationship?.id ?? personId}`} title={titles[action]} path={paths[action]} fields={fields[action]} body={accessBody} onValuesChange={values => { if (!action) return; const input = Object.fromEntries(values.entries()); const slot=`${membership?.schoolId}:${membership?.userId}:${paths[action]}`; const saved=formDrafts.get(slot); const revision=schoolAccessBasis(action,input,accessRows[action],saved,personId); if(saved&&revision!==undefined)formDrafts.save(slot,saved.values,{...saved.basis,expectedRevision:revision,accessSourceKey:schoolAccessSourceKey(action,input,personId)}); }} onLockedChange={setLocked} onSaved={() => { setAction(null); onChanged(); }} onCancel={() => setAction(null)} note={t.accessNote} /> : action && !sourceCurrent ? <p role="status">{copy.sourceUnavailable}</p> : null}
      </section>
    </div>
  </div>;
}
