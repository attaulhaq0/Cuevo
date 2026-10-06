'use client';
import { WorkspaceState } from '@cuevo/ui';
import { useCallback, useState, useSyncExternalStore } from 'react';
import { useApp } from '../../../shared/session/providers';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { parseSchoolPerson,validateAccountReceipt } from '../model';
import { CommandForm } from '../../../shared/components/command-form';
import { LearningError } from '../../../shared/components/feedback';
import { LoadMore } from '../../../shared/components/load-more';
import {schoolPersonChoices}from'../selection';
import { schoolAccountsAr,schoolAccountsEn } from '../account-messages';
import { LearningApiError } from '../../../shared/api/client';
export function SchoolAccountRecovery({ onRequested,onLockedChange }: { onRequested: () => void;onLockedChange?:(locked:boolean)=>void }) {
  const {locale,commandJournal,membership}=useApp(),t=locale==='ar'?schoolAccountsAr:schoolAccountsEn;
  const [selected,setSelected]=useState(''),[basis,setBasis]=useState<number|null>(null),[locked,setLocked]=useState(false);
  useSyncExternalStore(commandJournal.subscribe,commandJournal.getSnapshot,commandJournal.getSnapshot);
  const original=commandJournal.pending().find(command=>/^\/v1\/school\/accounts\/[^/]+\/recovery$/.test(command.path));
  const selectionLocked=locked||!!original;
  const onLocked=useCallback((value:boolean)=>{setLocked(value);onLockedChange?.(value);},[onLockedChange]);
  const people=usePaginatedLearningQuery('/v1/school/people?limit=100',parseSchoolPerson,0);
  const choices=schoolPersonChoices(people.data.filter(person=>person.status==='active'),locale);
  const complete=people.loaded&&!people.loading&&!people.loadingMore&&!people.error&&!people.moreError&&!people.nextCursor;
  const person=complete?people.data.find(item=>item.id===selected&&item.status==='active'&&!choices.find(choice=>choice.value===item.id)?.requiresReview):undefined;
  const sourceCurrent=person&&person.revision===basis;
  return <section className="school-account-recovery" aria-label={t.recover}><h3>{t.recover}</h3><p>{t.recoverNote}</p>
    {people.loading?<WorkspaceState kind="loading" icon="refresh" description={t.loadingMembers} role="status"/>:people.error?<LearningError error={people.error}/>:complete&&!choices.length?<WorkspaceState kind="empty" icon="people" description={t.recoveryMembersEmpty}/>:<div className="field"><label htmlFor="school-recovery-member">{t.member}</label><select id="school-recovery-member" value={selected} disabled={selectionLocked||!complete} onChange={event=>{if(selectionLocked)return;const id=event.target.value;setSelected(id);setBasis(Number(people.data.find(item=>item.id===id)?.revision)||null);}}><option value="">{t.choose}</option>{choices.map(choice=><option key={choice.value} value={choice.value} disabled={choice.requiresReview}>{choice.label}</option>)}</select></div>}
    <LoadMore query={{...people,loadingMore:people.loadingMore||selectionLocked,loadMore:()=>{if(!selectionLocked)people.loadMore();}}}/>
    {!complete?<WorkspaceState kind="review" icon="people" description={t.membersIncomplete}/>:null}{choices.some(choice=>choice.requiresReview)?<WorkspaceState kind="review" icon="people" description={t.membersReview}/>:null}
    {original&&!sourceCurrent?<CommandForm title={t.recoverApprove} path={original.path} fields={[]} body={()=>{throw new LearningApiError('conflict');}} note={t.original} validateReceipt={(receipt,command)=>{validateAccountReceipt(receipt,'recovery',membership?.schoolId??'',command.body,command.path.split('/')[4]);}} onLockedChange={onLocked} onSaved={onRequested}/>
    :sourceCurrent?<CommandForm key={`${person.id}:${basis}`} title={t.recoverApprove} path={`/v1/school/accounts/${person.id}/recovery`} draftKey={`/v1/school/account-recovery/${person.id}/${basis}`} fields={[{name:'reason',label:t.reason,type:'textarea',required:true,maxLength:1000},{name:'confirmRecovery',label:t.recoverConfirm,type:'checkbox',required:true}]} body={values=>{if(!sourceCurrent)throw new LearningApiError('conflict');return{expectedMembershipRevision:basis,reason:String(values.get('reason')).trim(),confirmRecovery:values.get('confirmRecovery')==='on'};}} validateReceipt={(receipt,command)=>{validateAccountReceipt(receipt,'recovery',membership?.schoolId??'',command.body,person.id);}} onLockedChange={onLocked} onSaved={onRequested}/>
    :selected?<WorkspaceState kind="review" icon="person" description={t.sourceChanged}/>:null}
  </section>;
}
