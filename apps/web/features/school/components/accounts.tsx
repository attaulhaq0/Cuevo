'use client';
import { WorkspaceState } from '@cuevo/ui';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button, CuevoIcon, Status } from '@cuevo/ui';
import { schoolAccountEffectReceiptSchema, schoolAccountAvailabilitySchema } from '@cuevo/contracts';
import { useApp } from '../../../shared/session/providers';
import { useApi, useApiQuery } from '../../../shared/hooks/use-api';
import { CommandForm } from '../../../shared/components/command-form';
import { LearningError } from '../../../shared/components/feedback';
import { LearningApiError } from '../../../shared/api/client';
import { SchoolAccountRecovery } from './account-recovery';
import { queryReadFrame } from '../../../shared/hooks/query-frame';
import { currentSchoolRead,readBoundAccountPage,parseBoundDelivery,validateAccountReceipt,parseAccountSelection } from '../model';
import { schoolAccountsAr, schoolAccountsEn } from '../account-messages';
import { captureCommandReceiptValidator, confirmCommandReceipt, type Command } from '../../../shared/api/client';

const parseAvailability=(value:unknown)=>{const parsed=schoolAccountAvailabilitySchema.safeParse(value);if(!parsed.success)throw new LearningApiError('invalid');return parsed.data;};
export function SchoolAccounts() {
  const app=useApp(),{locale}=app;const [refresh,setRefresh]=useState(0);
  const availability=useApiQuery('/v1/school/accounts/availability',parseAvailability,refresh);
  if(availability.loading)return <WorkspaceState kind="loading" icon="refresh" description={locale==='ar'?'جارٍ التحقق من إعداد حسابات المدرسة…':'Checking school account setup…'} role="status"/>;
  if(availability.error)return <><LearningError error={availability.error}/><Button type="button" variant="quiet" onClick={()=>setRefresh(value=>value+1)}>{locale==='ar'?'إعادة التحقق من الإعداد':'Check setup again'}</Button></>;
  if(availability.data?.state!=='AVAILABLE')return <section className="school-section" aria-label={locale==='ar'?'إعداد حسابات المدرسة مطلوب':'School account setup required'}><WorkspaceState kind="unavailable" icon="person" title={locale==='ar'?'إعداد حسابات المدرسة مطلوب':'School account setup required'} headingLevel={2} description={availability.data?.reason==='DELIVERY_UNAVAILABLE'?locale==='ar'?'إرسال روابط الحسابات غير متاح. تواصل مع دعم مدرستك لتفعيل الإرسال ثم تحقق من الإعداد مجددًا.':'Account link delivery is unavailable. Contact your school support team to configure delivery, then check setup again.':locale==='ar'?'يحتاج مسؤول تشغيل كويفو إلى تأكيد إعداد الحسابات قبل الدعوات أو الاستعادة. تواصل مع دعم مدرستك ثم تحقق من الإعداد مجددًا.':'Cuevo operations must confirm account setup before invitations or recovery. Contact your school support team, then check setup again.'}/><Button type="button" variant="quiet" onClick={()=>setRefresh(value=>value+1)}>{locale==='ar'?'إعادة التحقق من الإعداد':'Check setup again'}</Button></section>;
  return <ActiveSchoolAccounts key={`${app.apiUrl}:${app.membership?.schoolId}:${app.membership?.userId}:${app.membership?.role}`}/>;
}
type AccountAction={kind:'invite'|'recover'}|{kind:'revoke';id:string;revision:number};
function AccountDeliveryRecovery({command,onSettled}:{command:Command;onSettled:()=>void}){
  const app=useApp(),t=app.locale==='ar'?schoolAccountsAr:schoolAccountsEn,[refresh,setRefresh]=useState(0),[receiptError,setReceiptError]=useState<LearningApiError|null>(null);
  const id=command.path.split('/')[5],path=`/v1/school/accounts/invitations/${id}/delivery`,scope=queryReadFrame(app,path,refresh);
  const parse=useCallback((input:unknown)=>({scope,value:parseBoundDelivery(input,app.membership?.schoolId??'',id)}),[scope,id,app.membership?.schoolId]);
  const read=useApiQuery(path,parse,refresh),status=currentSchoolRead(read.data,scope);
  useEffect(()=>{if(!status?.receipt||!['COMPLETED','FAILED'].includes(status.state))return;try{confirmCommandReceipt(app.commandJournal,command.path,command.key,status.receipt,onSettled,(receipt)=>{const output=schoolAccountEffectReceiptSchema.parse(receipt);if(output.id!==id||output.schoolId!==app.membership?.schoolId)throw new LearningApiError('invalid',true);});}catch{setReceiptError(new LearningApiError('invalid',true));}},[status,app.commandJournal,app.membership?.schoolId,command.path,command.key,id,onSettled]);
  return <section aria-label={t.previous} className="school-account-delivery-recovery"><h3>{t.previous}</h3><p>{t.pending}</p>{read.loading?<WorkspaceState kind="loading" icon="refresh" description={t.sending} role="status"/>:read.error?<LearningError error={read.error}/>:null}{receiptError?<LearningError error={receiptError}/>:null}<Button type="button" variant="quiet" onClick={()=>setRefresh(x=>x+1)}>{t.refresh}</Button></section>;
}
function ActiveSchoolAccounts() {
  const app=useApp(),{locale,dictionary,membership,commandJournal,formDrafts}=app,t=locale==='ar'?schoolAccountsAr:schoolAccountsEn;
  const selectionSlot=`${membership?.schoolId}:${membership?.userId}:/v1/school/accounts:selection`;
  const [initial]=useState(()=>parseAccountSelection(formDrafts.model(selectionSlot)));
  const {request}=useApi(); const [refresh,setRefresh]=useState(0),[selected,setSelected]=useState(initial?.kind==='read'||initial?.kind==='revoke'?initial.id:''),[cursor,setCursor]=useState<string|null>(null),[action,setAction]=useState<AccountAction|null>(initial&&initial.kind!=='read'?initial:null),[locked,setLocked]=useState(false),[sending,setSending]=useState(false),[error,setError]=useState<LearningApiError|null>(null);
  useSyncExternalStore(commandJournal.subscribe,commandJournal.getSnapshot,commandJournal.getSnapshot);
  const schoolId=membership?.schoolId??'',pagePath=`/v1/school/accounts/invitations?limit=25${cursor?`&cursor=${cursor}`:''}`,pageScope=queryReadFrame(app,pagePath,refresh);
  const parsePage=useCallback((input:unknown)=>({scope:pageScope,value:readBoundAccountPage(input,schoolId)}),[pageScope,schoolId]);
  const pageRead=useApiQuery(pagePath,parsePage,refresh),page={...pageRead,data:currentSchoolRead(pageRead.data,pageScope)};
  const current=page.data?.items.find(item=>item.id===selected);
  const deliveryPath=current?`/v1/school/accounts/invitations/${current.id}/delivery`:null,deliveryScope=queryReadFrame(app,deliveryPath,refresh);
  const parseStatus=useCallback((input:unknown)=>({scope:deliveryScope,value:parseBoundDelivery(input,schoolId,current?.id??'')}),[deliveryScope,current?.id,schoolId]);
  const deliveryRead=useApiQuery(deliveryPath,parseStatus,refresh),delivery={...deliveryRead,data:currentSchoolRead(deliveryRead.data,deliveryScope)};
  const accountCommands=commandJournal.pending().filter(command=>/^\/v1\/school\/accounts(?:\/|$)/.test(command.path));
  const selectionLocked=locked||sending||accountCommands.length>0;
  const onLocked=useCallback((value:boolean)=>setLocked(value),[]);
  const actionPath=action?.kind==='invite'?'/v1/school/accounts/invitations':action?.kind==='revoke'?`/v1/school/accounts/invitations/${action.id}/revoke`:null;
  const retained=actionPath?commandJournal.get(actionPath):undefined;
  const revokeCurrent=action?.kind==='revoke'&&current?.id===action.id&&current.revision===action.revision&&!['CLAIMED','REVOKED'].includes(current.status);
  const reading=!!action||!!selected;
  const heading=useRef<HTMLHeadingElement>(null),reader=useRef<HTMLElement>(null),opener=useRef<HTMLElement>(null),returnFocus=useRef(false),openFocus=useRef(false),mounted=useRef(false),requestFrame=useRef('');
  const liveRequestFrame=queryReadFrame(app,null,0);
  requestFrame.current=liveRequestFrame;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{setSending(false);setError(null);},[liveRequestFrame]);
  useEffect(()=>{if(openFocus.current&&reader.current){reader.current.focus({preventScroll:true});openFocus.current=false;}if(returnFocus.current){const target=opener.current?.isConnected&&opener.current.matches('button,input,select,[tabindex]')&&opener.current.getClientRects().length?opener.current:heading.current;target?.focus();if(document.activeElement!==target)heading.current?.focus();returnFocus.current=false;}},[reading,selected,action]);
  function close(){if(selectionLocked)return;formDrafts.remove(selectionSlot);setAction(null);setSelected('');setError(null);returnFocus.current=true;}
  const saved=useCallback(()=>{formDrafts.remove(selectionSlot);setAction(null);setSelected('');setCursor(null);setRefresh(x=>x+1);},[formDrafts,selectionSlot]);
  function choose(value:string,element:HTMLElement){if(selectionLocked)return;opener.current=element;openFocus.current=true;if(value)formDrafts.saveModel(selectionSlot,{kind:'read',id:value});else formDrafts.remove(selectionSlot);setAction(null);setSelected(value);setError(null);}
  function start(kind:'invite'|'recover',element:HTMLElement){if(selectionLocked)return;opener.current=element;openFocus.current=true;formDrafts.saveModel(selectionSlot,{kind});setSelected('');setAction({kind});}
  async function send(){
    if(!current||selectionLocked||delivery.loading||delivery.error||delivery.data?.state!=='PENDING'||delivery.data.receipt)return;
    const path=`/v1/school/accounts/invitations/${current.id}/deliver`,scope=requestFrame.current;
    const command=commandJournal.prepare(path,path,{expectedRevision:1,confirmDelivery:true});setSending(true);setError(null);
    const currentRequest=()=>mounted.current&&requestFrame.current===scope&&commandJournal.get(path)?.key===command.key;
    try{const validator=captureCommandReceiptValidator(command,(output)=>{const receipt=schoolAccountEffectReceiptSchema.parse(output);if(receipt.id!==current.id||receipt.schoolId!==schoolId)throw new LearningApiError('invalid',true);});
      const output=await request(path,{command});confirmCommandReceipt(commandJournal,path,command.key,output,currentRequest()?()=>setRefresh(x=>x+1):undefined,validator);
    }catch(failure){const safe=failure instanceof LearningApiError?failure:new LearningApiError('invalid',true),publish=currentRequest();if(!safe.uncertain)commandJournal.confirm(path,command.key);if(publish)setError(safe);}finally{if(mounted.current&&requestFrame.current===scope)setSending(false);}
  }
  const recovery=accountCommands.find(command=>command.path!==actionPath&&!(action?.kind==='recover'&&/^\/v1\/school\/accounts\/[^/]+\/recovery$/.test(command.path)));
  return <section className="school-section school-accounts" aria-label={t.title}>
    <header className="cuevo-section-header"><div className="cuevo-section-header__context"><h2 ref={heading} tabIndex={-1}>{t.title}</h2></div><Button type="button" variant="quiet" disabled={sending} onClick={()=>setRefresh(x=>x+1)}><CuevoIcon name="refresh" size={18}/>{t.refresh}</Button>{!action?<><Button type="button" disabled={selectionLocked} onClick={event=>start('invite',event.currentTarget)}>{t.invite}</Button><Button type="button" variant="secondary" disabled={selectionLocked} onClick={event=>start('recover',event.currentTarget)}>{t.recover}</Button></>:null}</header>
    <details className="school-accounts-help"><summary>{t.about}</summary><p>{t.note}</p></details>
    <div className="school-accounts-layout" data-selected={reading}>
      <section className="school-accounts-directory" aria-label={t.selected}>
        {page.loading?<WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/>:page.error?<LearningError error={page.error}/>:<><div className="field"><label htmlFor="school-account-invitation">{t.selected}</label><select id="school-account-invitation" value={selected} disabled={selectionLocked} onChange={event=>choose(event.target.value,event.currentTarget)}><option value="">{t.choose}</option>{page.data?.items.map(item=><option key={item.id} value={item.id}>{item.displayName} · {item.email} · {dictionary.roles[item.role]}{item.purpose==='recovery'?` · ${t.accountRecovery}`:''}</option>)}</select></div>{!page.data?.items.length?<WorkspaceState kind={page.data?.nextCursor ? "review" : "empty"} icon="person" description={t.empty}/>:<ul>{page.data.items.map(item=><li key={item.id}><Button type="button" variant="quiet" disabled={selectionLocked} aria-pressed={selected===item.id} onClick={event=>choose(item.id,event.currentTarget)}><span><strong><bdi>{item.displayName}</bdi></strong><small><bdi>{item.email}</bdi> · {dictionary.roles[item.role]}</small></span><Status tone={item.status==='CLAIMED'?'positive':'neutral'}>{t.status[item.status]}</Status></Button></li>)}</ul>}<div className="learning-actions">{cursor?<Button type="button" variant="quiet" disabled={selectionLocked} onClick={()=>{setCursor(null);setSelected('');}}>{t.first}</Button>:null}{page.data?.nextCursor?<Button type="button" variant="quiet" disabled={selectionLocked} onClick={()=>{setCursor(page.data!.nextCursor);setSelected('');}}>{t.next}</Button>:null}</div></>}
      </section>
      {reading?<section ref={reader} tabIndex={-1} className="school-accounts-reader"><Button type="button" variant="quiet" disabled={selectionLocked} onClick={close}>{t.back}</Button>
        {action?.kind==='invite'?<CommandForm title={t.invite} path="/v1/school/accounts/invitations" fields={[{name:'displayName',label:t.name,required:true,maxLength:200},{name:'email',label:t.email,required:true,maxLength:254},{name:'role',label:t.role,type:'select',required:true,options:(['admin','coordinator','teacher','student','parent']as const).map(role=>({value:role,label:dictionary.roles[role]}))},{name:'reason',label:t.reason,type:'textarea',required:true,maxLength:1000},{name:'confirmInvitation',label:t.confirm,type:'checkbox',required:true}]} body={values=>({displayName:String(values.get('displayName')).trim(),email:String(values.get('email')).trim(),role:String(values.get('role')),reason:String(values.get('reason')).trim(),confirmInvitation:values.get('confirmInvitation')==='on'})} validateReceipt={(receipt,command)=>{validateAccountReceipt(receipt,'invite',schoolId,command.body);}} onLockedChange={onLocked} onSaved={saved} onCancel={close} note={t.note}/>
        :action?.kind==='recover'?<SchoolAccountRecovery onRequested={saved} onLockedChange={onLocked}/>
        :action?.kind==='revoke'?retained&&!revokeCurrent?<CommandForm title={t.revoke} path={actionPath!} fields={[]} body={()=>{throw new LearningApiError('conflict');}} note={t.original} validateReceipt={(receipt,command)=>{validateAccountReceipt(receipt,'revoke',schoolId,command.body,action.id);}} onLockedChange={onLocked} onSaved={saved}/>:revokeCurrent?<CommandForm key={`${action.id}:${action.revision}`} title={t.revoke} path={actionPath!} fields={[{name:'reason',label:t.reason,type:'textarea',required:true,maxLength:1000},{name:'confirmRevocation',label:t.revokeConfirm,type:'checkbox',required:true}]} body={values=>{if(!revokeCurrent)throw new LearningApiError('conflict');return{expectedRevision:action.revision,reason:String(values.get('reason')).trim(),confirmRevocation:values.get('confirmRevocation')==='on'};}} validateReceipt={(receipt,command)=>{validateAccountReceipt(receipt,'revoke',schoolId,command.body,action.id);}} onLockedChange={onLocked} onSaved={saved} onCancel={()=>{formDrafts.saveModel(selectionSlot,{kind:'read',id:action.id});setAction(null);}}/>:<WorkspaceState kind="review" icon="person" description={t.sourceChanged}/>
        :current?<article><header className="cuevo-section-header"><div className="cuevo-section-header__context"><h3><bdi>{current.displayName}</bdi></h3><p><bdi>{current.email}</bdi> · {dictionary.roles[current.role]}</p></div><Status tone={current.status==='CLAIMED'?'positive':'neutral'}>{t.status[current.status]}</Status></header>{current.purpose==='recovery'?<p>{t.recoveryPurpose}</p>:null}<p>{t.expiry}: <bdi>{new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short'}).format(new Date(current.expiresAt))}</bdi></p>{current.status==='CLAIMED'?<p role="status">{current.purpose==='recovery'?t.recoveryCompleted:t.claimed}</p>:current.status==='REVOKED'?<p role="status">{t.revoked}</p>:delivery.error?<LearningError error={delivery.error}/>:delivery.loading?<WorkspaceState kind="loading" icon="refresh" description={t.sending} role="status"/>:<><p role="status">{delivery.data?.receipt?.status==='AWAITING_CLAIM'?current.purpose==='recovery'?t.recoveryCaptured:t.captured:t.pending}</p>{!delivery.data?.receipt&&delivery.data?.state==='PENDING'?<Button type="button" disabled={selectionLocked} onClick={()=>void send()}>{current.purpose==='recovery'?t.sendRecovery:t.send}</Button>:null}</>}{!['CLAIMED','REVOKED'].includes(current.status)?<Button type="button" variant="secondary" disabled={selectionLocked} onClick={()=>{formDrafts.saveModel(selectionSlot,{kind:'revoke',id:current.id,revision:current.revision});setAction({kind:'revoke',id:current.id,revision:current.revision});}}>{t.revoke}</Button>:null}</article>:page.loading?<WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/>:<WorkspaceState kind="review" icon="person" description={t.sourceChanged}/>}
        {error?<LearningError error={error}/>:null}
      </section>:null}
    </div>
    {recovery?recovery.path.endsWith('/deliver')?<AccountDeliveryRecovery command={recovery} onSettled={saved}/>:<CommandForm title={t.previous} path={recovery.path} fields={[]} body={()=>{throw new LearningApiError('conflict');}} note={t.original} validateReceipt={(receipt,command)=>{const kind=command.path.endsWith('/revoke')?'revoke':command.path.endsWith('/recovery')?'recovery':'invite';validateAccountReceipt(receipt,kind,schoolId,command.body,kind==='revoke'?command.path.split('/')[5]:kind==='recovery'?command.path.split('/')[4]:undefined);}} onSaved={saved}/>:null}
  </section>;
}
