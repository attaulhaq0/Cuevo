'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button, CuevoIcon, Status } from '@cuevo/ui';
import { schoolAccessRevision, schoolAccessBasis, schoolAccessSourceKey, type SchoolPerson, type SchoolRow } from '../model';
import { useApp } from '../../../shared/session/providers';
import { CommandForm, type FormField } from '../../../shared/components/command-form';
import { schoolAr, schoolEn } from '../messages';
import { AccessDirectory } from './access-directory';
import { schoolAccessDirectoryRows, currentAccessDirectoryRow, currentAccessPerson, filterAccessDirectory, recoveredAccessRelationship, type AccessDirectoryKind, type AccessDirectoryRow, type AccessDirectorySource } from '../access-directory-model';
import { SchoolSourceContinuation } from './source-continuation';
import { accessDirectoryEn, accessDirectoryAr } from '../access-directory-messages';
import { LearningApiError } from '../../../shared/api/client';
import { schoolPersonChoices, schoolRecordChoices } from '../selection';
import { schoolRelationshipSelectionSafe } from '../relationship-display';
export function SchoolAccess({ people, enrollments, assignments, guardians, classes, subjects, canManage, onChanged, relationshipsComplete = true, directorySources }: { people: SchoolPerson[]; enrollments: SchoolRow[]; assignments: SchoolRow[]; guardians: SchoolRow[]; classes: SchoolRow[]; subjects: SchoolRow[]; canManage: boolean; onChanged: () => void; relationshipsComplete?: boolean; directorySources?:Record<AccessDirectoryKind,AccessDirectorySource> }) {
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
  const selectedHeading = useRef<HTMLHeadingElement>(null), focusSelected = useRef(false);
  const [selectionRequest, setSelectionRequest] = useState(0);
  const [locked, setLocked] = useState(false);
  const [reviewedPerson, setReviewedPerson] = useState<SchoolPerson | null>(retainedAction === 'person' ? retainedPerson ?? null : null);
  const pending = commandJournal.pending().some(command => /^\/v1\/school\/(people\/|enrollments$|teacher-assignments$|guardian-relationships$)/.test(command.path));
  const selectionLocked = locked || pending;
  const personChoices = schoolPersonChoices(people, locale);
  const currentPerson = currentAccessPerson(people, personId);
  const personSelectionSafe = !!currentPerson && personChoices.find(choice => choice.value === personId)?.requiresReview === false;
  const person = action === 'person' && reviewedPerson ? reviewedPerson : currentPerson;
  const choices = (rows: SchoolRow[]) => rows.length && 'displayName' in rows[0] ? schoolPersonChoices(rows as SchoolPerson[], locale).filter(choice => !choice.requiresReview) : schoolRecordChoices(rows, rows === classes ? 'classes' : 'subjects', locale).filter(choice => !choice.requiresReview);
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
    if (!action) throw new LearningApiError('invalid');
    if (action === 'person' && !personSelectionSafe || action !== 'person' && (!relationshipsComplete || !selectedRelationshipSafe())) throw new LearningApiError('invalid');
    if (relationship && !accessRows[action].some(row => row.id === relationship.id && row.revision === relationship.revision) && !commandJournal.get(paths[action])) throw new LearningApiError('conflict');
    if (action === 'person' && currentPerson?.revision !== person?.revision && !commandJournal.get(paths.person)) throw new LearningApiError('conflict');
    const input = Object.fromEntries(fields[action].map(field => [field.name, field.name === 'confirmAccessChange' ? values.get(field.name) === 'on' : field.name === 'effectiveFrom' ? relationship && String(values.get(field.name)) === local(String(relationship.effectiveFrom)) ? relationship.effectiveFrom : action === 'person' && String(values.get(field.name)) === local(person?.effectiveFrom) ? person!.effectiveFrom : new Date(String(values.get(field.name))).toISOString() : field.name === 'effectiveTo' ? relationship && String(values.get(field.name)) === local(typeof relationship.effectiveTo === 'string' ? relationship.effectiveTo : null) ? relationship.effectiveTo : action === 'person' && String(values.get(field.name)) === local(person?.effectiveTo) ? person!.effectiveTo : values.get(field.name) ? new Date(String(values.get(field.name))).toISOString() : null : String(values.get(field.name))]));
    for (const field of fields[action].filter(field => ['studentId', 'parentId', 'teacherId', 'classId', 'subjectId'].includes(field.name))) if (!field.options?.some(option => option.value === input[field.name])) throw new LearningApiError('invalid');
    const revision = schoolAccessRevision(action, input, accessRows[action], personId);
    if (revision !== undefined) input.expectedRevision = revision;
    return input;
  }
  const currentRows = accessRows[directoryKind];
  const recordRows = schoolAccessDirectoryRows(directoryKind, currentRows, people, classes, subjects, locale, relationshipsComplete);
  const currentSource=directorySources?.[directoryKind];
  const [denial,setDenial]=useState<{context:string;error:LearningApiError}|null>(null);
  const refused=[currentSource?.error,currentSource?.moreError].find(error=>error?.kind==='denied'||error?.kind==='unauthorized');
  const currentDenial=refused&&currentSource?(denial?.context===currentSource.context&&denial.error===refused?denial:{context:currentSource.context,error:refused}):denial?.context===currentSource?.context?denial:null;
  if(currentDenial!==denial)setDenial(currentDenial);
  const sourceDenied=!!currentDenial;
  const directorySourceCurrent=!currentSource||currentSource.loaded&&!currentSource.loading&&!currentSource.error&&!sourceDenied;
  const selected = directorySourceCurrent?currentAccessDirectoryRow(recordRows, selectedId):null;
  useEffect(() => {
    if (focusSelected.current && selected && selectedHeading.current) {
      focusSelected.current = false;
      selectedHeading.current.focus({ preventScroll: true });
      selectedHeading.current.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }, [selected, selectionRequest]);
  const editingCurrent = action !== 'person' && relationship ? accessRows[action ?? 'enrollment'].filter(row => row.id === relationship.id) : [];
  const personBasis = action === 'person' ? formDrafts.get(`${membership?.schoolId}:${membership?.userId}:${paths.person}`)?.basis.expectedRevision : undefined;
  function selectedRelationshipSafe() {
    if (!action || action === 'person') return true;
    const draft = formDrafts.get(`${membership?.schoolId}:${membership?.userId}:${paths[action]}`);
    const retainedExisting = Number(draft?.basis.expectedRevision) > 0;
    const original = relationship ?? (retainedExisting ? recoveredAccessRelationship(action, draft?.values ?? {}, accessRows[action]) : null);
    return !original && !retainedExisting || schoolRelationshipSelectionSafe(action, original?.id, accessRows[action], people, classes, subjects, locale, relationshipsComplete);
  }
  const relationshipSafe = selectedRelationshipSafe();
  const identitySafe = directorySourceCurrent && (action === 'person' ? personSelectionSafe : relationshipsComplete && relationshipSafe);
  const recovery = action && commandJournal.get(paths[action]);
  const sourceCurrent = action === 'person' ? !!currentPerson && currentPerson.revision === person?.revision && (personBasis === undefined || personBasis === currentPerson.revision) : !relationship || editingCurrent.length === 1 && editingCurrent[0].revision === relationship.revision;
  function chooseKind(kind: AccessDirectoryKind) { if (selectionLocked) return; setDirectoryKind(kind); setSelectedId(null); setQuery(''); setAction(null); setRelationship(null); }
  function chooseRecord(row: AccessDirectoryRow) {
    if (selectionLocked || row.requiresReview) return;
    focusSelected.current = true;
    setSelectionRequest(value => value + 1);
    setSelectedId(row.id); setAction(null);
    if (directoryKind === 'person') { setPersonId(row.id); setRelationship(null); } else setRelationship(row.source);
  }
  function editSelected() { if (!selected || selected.requiresReview || selectionLocked) return; if (directoryKind === 'person') { setPersonId(selected.id); setReviewedPerson(currentAccessPerson(people, selected.id) ?? null); } else setRelationship(selected.source); setAction(directoryKind); }
  function createRelationship() { if (selectionLocked || !relationshipsComplete || directoryKind === 'person') return; setRelationship(null); setSelectedId(null); setAction(directoryKind); }
  return <div className="school-access-workspace">
    <header className="cuevo-section-header"><div className="cuevo-section-header__context"><h2>{copy.title}</h2><p>{copy.body}</p></div><details className="school-access-help"><summary>{copy.note}</summary><p>{t.accessNote}</p></details></header>
    {canManage && directoryKind !== 'person' && !action ? <div className="learning-actions"><Button type="button" variant="secondary" disabled={selectionLocked || !relationshipsComplete} onClick={createRelationship}>{copy.create}</Button></div> : null}
    {personChoices.some(choice => choice.requiresReview) ? <p className="notice">{locale === 'ar' ? 'راجع أسماء الأعضاء وسياقهم في سجلات المدرسة ثم حدّث قبل اختيار الشخص.' : 'Review member names and current context in school records, then refresh before selecting a person.'}</p> : null}
    <div className="school-access-layout" data-selected={!!selected || !!action || !!selectedId}>
      <AccessDirectory locale={locale} kind={directoryKind} rows={filterAccessDirectory(recordRows, query, locale)} selectedId={selectedId} query={query} locked={selectionLocked} statusLabel={statusLabel} onKind={chooseKind} onQuery={setQuery} onSelect={chooseRecord} source={directorySources?.[directoryKind]}/>
      {selected || action || selectedId ? <section className="school-access-selected" aria-label={copy.selected}>
        {selected ? <><header className="cuevo-section-header"><div className="cuevo-section-header__context"><h2 ref={selectedHeading} tabIndex={-1}><CuevoIcon name="person" size={28}/><bdi>{selected.title}</bdi></h2><p><bdi>{selected.context}</bdi></p></div><Status tone={selected.status === 'active' ? 'positive' : 'neutral'}>{statusLabel(selected.status)}</Status></header>{selected.relationship && directoryKind !== 'guardian' ? <dl className="academic-facts"><div><dt>{t.class}</dt><dd data-relationship-class="true"><bdi>{selected.relationship.className ?? t.nameUnavailable}</bdi></dd></div><div><dt>{t.yearGroup}</dt><dd><bdi>{selected.relationship.yearGroupName ?? t.nameUnavailable}</bdi></dd></div><div><dt>{t.year}</dt><dd><bdi>{selected.relationship.academicYearName ?? t.nameUnavailable}</bdi></dd></div>{directoryKind === 'assignment' ? <div><dt>{t.subject}</dt><dd><bdi>{selected.relationship.subjectName ?? t.nameUnavailable}</bdi></dd></div> : null}</dl> : null}<dl className="school-access-facts"><div><dt>{copy.from}</dt><dd><bdi>{dateLabel(selected.source.effectiveFrom)}</bdi></dd></div><div><dt>{copy.to}</dt><dd><bdi>{selected.source.effectiveTo === null ? copy.ongoing : dateLabel(selected.source.effectiveTo)}</bdi></dd></div></dl><details className="support-reference"><summary>{locale === 'ar' ? 'تفاصيل المصدر' : 'Source details'}</summary><p>{locale === 'ar' ? 'مراجعة السجل' : 'Record revision'}: {typeof selected.source.revision === 'number' ? new Intl.NumberFormat(locale).format(selected.source.revision) : t.nameUnavailable}</p></details>{canManage && !action ? <Button type="button" variant="secondary" disabled={selectionLocked || selected.requiresReview} onClick={editSelected}>{copy.edit}</Button> : null}</> : action ? null : <><h2>{copy.choose}</h2><p>{selectedId ? copy.sourceUnavailable : copy.chooseBody}</p></>}
        {action && !identitySafe ? <p className="notice">{locale === 'ar' ? 'تغيّر سياق العلاقة المحددة أو تعذّر تمييزه. راجع السجلات الحالية قبل إرسال تغيير جديد.' : 'The selected record context changed or cannot be distinguished. Review current records before sending a new change.'}</p> : null}
        {!sourceDenied && canManage && action && recovery && (!identitySafe || !sourceCurrent) ? <CommandForm title={titles[action]} path={paths[action]} fields={[]} body={() => { throw new LearningApiError('invalid'); }} onSaved={() => { setAction(null); onChanged(); }} note={locale === 'ar' ? 'يمكنك التحقق من نتيجة الطلب السابق بمفتاحه الأصلي. لا يُرسل تغيير جديد من هذا السياق.' : 'Reconcile the previous request with its original key. This context cannot send a new change.'} /> : canManage && action && identitySafe && (action !== 'person' || person) && sourceCurrent ? <CommandForm key={`${action}:${relationship?.id ?? personId}`} title={titles[action]} path={paths[action]} fields={fields[action]} body={accessBody} onValuesChange={values => { if (!action) return; const input = Object.fromEntries(values.entries()); const slot=`${membership?.schoolId}:${membership?.userId}:${paths[action]}`; const saved=formDrafts.get(slot); const revision=schoolAccessBasis(action,input,accessRows[action],saved,personId); if(saved&&revision!==undefined)formDrafts.save(slot,saved.values,{...saved.basis,expectedRevision:revision,accessSourceKey:schoolAccessSourceKey(action,input,personId)}); }} onLockedChange={setLocked} onSaved={() => { setAction(null); onChanged(); }} onCancel={() => setAction(null)} note={t.accessNote} /> : action && !sourceCurrent ? <p role="status">{copy.sourceUnavailable}</p> : null}
      </section> : null}
    </div>{directorySources?(Object.keys(directorySources)as AccessDirectoryKind[]).filter(kind=>kind!==directoryKind).map(kind=><SchoolSourceContinuation key={kind} query={{...directorySources[kind],loadMore:directorySources[kind].loadMore??(()=>{})}} label={{person:copy.people,enrollment:copy.enrollment,assignment:copy.assignment,guardian:copy.guardian}[kind]}/>):null}
  </div>;
}
