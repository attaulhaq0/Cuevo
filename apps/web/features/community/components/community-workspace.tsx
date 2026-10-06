'use client';
import { IconButton } from '@cuevo/ui';
import { WorkspaceState } from '@cuevo/ui';
import { useEffect, useRef, useState } from 'react';
import { Button, Status, WorkspacePageHeading, WorkspaceTabs } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { parseChoice,choiceLabel } from '../../learning/model';
import { CommandForm } from '../../../shared/components/command-form';
import { LearningError } from '../../../shared/components/feedback';
import { LoadMore } from '../../../shared/components/load-more';
import { confirmCommunityReceipt, parseRoom, parseAnnouncement, parseParentAnnouncement, parseNotification, parseParentNotification, parseRosterPerson, communitySourceComplete, communitySourceDenied, type Room } from '../model';
import { communityAr, communityEn } from '../messages';
import { RoomDiscussion } from './room-discussion';
import { NotificationSource } from './notification-source';
import { ParentConversations } from './parent-conversations';
import { AnnouncementMaintenance } from './maintenance';
import { MentionSource } from './mention-source';
import { useApi } from '../../../shared/hooks/use-api';
import { canOpenWorkspace } from '../../../shared/session/capabilities';
import type {NavigationIntent} from '../../../shared/session/navigation-intent';
type NotificationIntent=Extract<NavigationIntent,{view:'community'}>;
type Tab = 'rooms' | 'announcements' | 'notifications' | 'conversations';
function allowedTab(section:Tab|null|undefined,parent:boolean,author:boolean):Tab {
  return !section||parent&&section==='rooms'||!parent&&!author&&section==='conversations'?parent?'announcements':'rooms':section;
}
export function CommunityWorkspace({intent,notificationActivation=0,onSectionChange}:{intent?:NotificationIntent|null;notificationActivation?:number;onSectionChange?:(section:Tab)=>void}={}) {
  const { membership, status, online, locale } = useApp();
  const t = locale === 'ar' ? communityAr : communityEn;
  if (!online) return <><WorkspacePageHeading title={t.community} /><WorkspaceState kind="unavailable" icon="offline" description={t.offline} role="status"/></>;
  if (status !== 'ready' || !membership || !canOpenWorkspace('community', membership.entitlements, membership.role)) return <WorkspacePageHeading title={t.community} />;
  return <CurrentCommunityWorkspace intent={intent} notificationActivation={notificationActivation} onSectionChange={onSectionChange} key={`${membership.schoolId}:${membership.userId}:${membership.role}`} />;
}

function CurrentCommunityWorkspace({intent,notificationActivation,onSectionChange}:{intent?:NotificationIntent|null;notificationActivation:number;onSectionChange?:(section:Tab)=>void}) {
  const { membership, locale, apiUrl, accessToken, accessGeneration, online, status } = useApp(); const t = locale === 'ar' ? communityAr : communityEn; const parent = membership?.role === 'parent'; const author = membership?.role === 'teacher' || membership?.role === 'admin';
  const { journal } = useApi();
  const [tab, setTab] = useState<Tab>(()=>allowedTab(intent?.section,parent,author)); const [room, setRoom] = useState<Room | null>(null); const [create, setCreate] = useState<'room' | 'group' | 'announcement' | null>(null); const [refresh, setRefresh] = useState(0);
  const root = useRef<HTMLDivElement>(null), directoryHeading = useRef<HTMLHeadingElement>(null);
  const focusScope = JSON.stringify([apiUrl,membership?.schoolId,membership?.userId,membership?.role,accessToken,accessGeneration,online,status,locale]);
  const currentFocusScope = useRef(focusScope); currentFocusScope.current = focusScope;
  const roomOpener = useRef<{element: HTMLButtonElement; source: Room; scope: string} | null>(null);
  const returnFocus = useRef<{scope: string; opener: typeof roomOpener.current} | null>(null);
  const rooms = usePaginatedLearningQuery(parent ? null : '/v1/community/rooms?limit=100', parseRoom, refresh);
  const announcements = usePaginatedLearningQuery('/v1/community/announcements?limit=100', parent ? parseParentAnnouncement : parseAnnouncement, refresh);
  const notifications = usePaginatedLearningQuery('/v1/community/notifications?limit=100', parent ? parseParentNotification : parseNotification, refresh);
  const classes = usePaginatedLearningQuery(author ? '/v1/classes?limit=100' : null, parseChoice, refresh);
  const priorNotificationActivation=useRef(notificationActivation);
  const priorNotificationIntent=useRef(intent?.section??null);
  useEffect(()=>{const section=intent?.section??null,activated=priorNotificationActivation.current!==notificationActivation,changed=priorNotificationIntent.current!==section;priorNotificationActivation.current=notificationActivation;priorNotificationIntent.current=section;if(!activated&&!changed)return;const nextTab=allowedTab(section,parent,author);setTab(nextTab);setRoom(null);setCreate(null);if(nextTab==='notifications')setRefresh(value=>value+1);},[intent?.section,notificationActivation,parent,author]);
  const [groupClassId, setGroupClassId] = useState(''); const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const classRoom = rooms.data.find(item => item.classId === groupClassId && item.type === 'CLASS');
  const groupRoster = usePaginatedLearningQuery(author && create === 'group' && classRoom ? `/v1/community/rooms/${classRoom.id}/roster?limit=100` : null, parseRosterPerson, refresh);
  useEffect(() => {
    const cancel = (event: FocusEvent) => { if (returnFocus.current && event.target !== document.body && event.target !== document.documentElement) returnFocus.current = null; };
    document.addEventListener('focusin', cancel);
    return () => document.removeEventListener('focusin', cancel);
  }, []);
  useEffect(() => {
    const intent = returnFocus.current;
    if (!intent || room) return;
    if (intent.scope !== focusScope || tab !== 'rooms') { returnFocus.current = null; return; }
    if (rooms.loading || rooms.loadingMore || !rooms.loaded && !rooms.error) return;
    const frame = requestAnimationFrame(() => {
      if (returnFocus.current !== intent || currentFocusScope.current !== intent.scope) return;
      returnFocus.current = null;
      if (document.activeElement !== document.body && document.activeElement !== document.documentElement) return;
      const prior = intent.opener;
      const current = !rooms.error && !rooms.moreError && prior?.scope === focusScope ? rooms.data.find(item => item.id === prior.source.id && item.name === prior.source.name && item.classId === prior.source.classId && item.ownerId === prior.source.ownerId && item.type === prior.source.type && item.status === prior.source.status && item.revision === prior.source.revision) : null;
      const choice = current ? Array.from(root.current?.querySelectorAll<HTMLElement>('.community-room') ?? []).find(element => element.dataset.roomId === current.id)?.querySelector<HTMLButtonElement>('button') : null;
      const opener = current && prior?.element.isConnected ? prior.element : choice;
      const target = opener && !opener.disabled ? opener : directoryHeading.current;
      target?.focus({preventScroll: true});
      target?.scrollIntoView({block: 'nearest',behavior: 'instant'});
    });
    return () => cancelAnimationFrame(frame);
  }, [room,tab,focusScope,rooms.loading,rooms.loadingMore,rooms.loaded,rooms.error,rooms.moreError,rooms.data]);
  function reload() { setRefresh(value => value + 1); }
  function saved() { setCreate(null); reload(); }
  if (room && !parent) return <RoomDiscussion key={room.id} room={rooms.data.find(item => item.id === room.id) ?? room} onBack={() => { returnFocus.current = {scope: focusScope,opener: roomOpener.current}; setRoom(null); reload(); }} />;
  const active = tab === 'rooms' ? rooms : tab === 'announcements' ? announcements : notifications;
  return <div ref={root} className="community-workspace"><WorkspacePageHeading title={t[tab]} caption={t.community} headingRef={directoryHeading} /><p className="notice">{parent ? t.parentNote : t.safety}</p><WorkspaceTabs label={t.community} selected={tab} items={(parent ? ['announcements','notifications','conversations'] as const : author ? ['rooms','announcements','notifications','conversations'] as const : ['rooms','announcements','notifications'] as const).map(value=>({id:value,label:t[value],icon:({rooms:'community',announcements:'feedback',notifications:'notification',conversations:'community'}as const)[value]}))} onChange={value=>{setTab(value as Tab);setCreate(null);onSectionChange?.(value as Tab);}} actions={<IconButton icon="refresh" label={t.refresh} type="button" onClick={reload} />}/>{author ? <div className="learning-actions">{tab === 'rooms' ? <><Button type="button" onClick={() => setCreate('room')}>{t.createRoom}</Button><Button type="button" variant="secondary" onClick={() => setCreate('group')}>{t.createGroup}</Button></> : tab === 'announcements' ? <Button type="button" onClick={() => setCreate('announcement')}>{t.createAnnouncement}</Button> : null}</div> : null}{create === 'group' ? <section className="learning-form" aria-label={t.createGroup}><h3>{t.createGroup}</h3><div className="field"><label htmlFor="group-class">{t.class}</label><select id="group-class" disabled={!!journal.get('/v1/community/rooms')} value={groupClassId} onChange={event => { setGroupClassId(event.target.value); setSelectedMembers([]); }}><option value="">{t.class}</option>{classes.data?.map(item => <option key={item.id} value={item.id}>{choiceLabel(item)}</option>)}</select><LoadMore query={classes}/>{classes.error?<LearningError error={classes.error}/>:null}{!classes.data.length&&!classes.error&&!classes.loading?<WorkspaceState kind={communitySourceComplete(classes)?"review":"unknown"} icon="school" description={communitySourceComplete(classes)?t.noGroupClasses:t.partialRecords}/>:null}</div>{classRoom ? <fieldset><p className="learning-form__note">{t.memberNote}</p>{groupRoster.loading ? <WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/> : groupRoster.error ? <LearningError error={groupRoster.error} /> : null}<fieldset className="community-source-command" disabled={!journal.get('/v1/community/rooms')&&(groupRoster.loading||!!groupRoster.error||!!groupRoster.moreError||!groupRoster.data.some(person=>person.role==='student'))}><fieldset><legend>{t.members}</legend>{!groupRoster.loading&&!groupRoster.error&&!communitySourceDenied(groupRoster)&&!groupRoster.data.some(person=>person.role==='student')?<WorkspaceState kind={communitySourceComplete(groupRoster)?"review":"unknown"} icon="people" description={communitySourceComplete(groupRoster)?t.noGroupStudents:t.partialRecords}/>:null}{(communitySourceDenied(groupRoster)?[]:groupRoster.data.filter(person => person.role === 'student')).map(person => <label className="community-member-option" key={person.id}><input type="checkbox" disabled={!!journal.get('/v1/community/rooms')} checked={selectedMembers.includes(person.id)} onChange={event => setSelectedMembers(ids => event.target.checked ? [...ids, person.id] : ids.filter(id => id !== person.id))} /> <bdi>{person.displayName}</bdi></label>)}</fieldset><CommandForm title={t.createGroup} path="/v1/community/rooms" fields={[{ name: 'name', label: t.roomName, required: true }]} body={values => ({ classId: groupClassId, name: String(values.get('name')), type: 'GROUP', memberIds: selectedMembers })} validateReceipt={(receipt, command) => { confirmCommunityReceipt(receipt, command, membership?.userId); }} onSaved={saved} onCancel={() => setCreate(null)} note={t.memberNote} /></fieldset><LoadMore query={groupRoster} /></fieldset> : <WorkspaceState kind="review" icon="community" description={t.classRoomFirst} role="status"/>}</section> : null}{create && create !== 'group' && classes.loading ? <WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/> : create && create !== 'group' && classes.error ? <LearningError error={classes.error} /> : create && create !== 'group' ? <CommandForm title={create === 'room' ? t.createRoom : t.createAnnouncement} path={`/v1/community/${create === 'room' ? 'rooms' : 'announcements'}`} fields={create === 'room' ? [{ name: 'classId', label: t.class, type: 'select', required: true, options: classes.data?.map(item => ({ value: item.id, label: choiceLabel(item) })) }, { name: 'name', label: t.roomName, required: true }, { name: 'type', label: t.type, type: 'select', required: true, options: [{ value: 'CLASS', label: t.classRoom }, { value: 'GROUP', label: t.group }] }] : [{ name: 'classId', label: t.class, type: 'select', options: classes.data?.map(item => ({ value: item.id, label: choiceLabel(item) })) }, { name: 'title', label: t.title, required: true }, { name: 'body', label: t.message, type: 'textarea', required: true, maxLength: 4000 }, { name: 'parentVisible', label: t.parentVisible, type: 'checkbox' }]} body={values => create === 'room' ? { classId: String(values.get('classId')), name: String(values.get('name')), type: String(values.get('type')), memberIds: [] } : { classId: values.get('classId') ? String(values.get('classId')) : null, title: String(values.get('title')), body: String(values.get('body')), parentVisible: values.get('parentVisible') === 'on' }} validateReceipt={(receipt, command) => { confirmCommunityReceipt(receipt, command, membership?.userId); }} onSaved={saved} onCancel={() => setCreate(null)} note={create === 'room' ? t.memberNote : t.parentNote} /> : null}{create && create !== 'group'?<LoadMore query={classes}/>:null}{tab === 'conversations' ? <ParentConversations pageHeading /> : active.loading ? <WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/> : active.error ? <LearningError error={active.error} /> : tab === 'rooms' ? rooms.data.map(item => <article className="community-room" key={item.id} data-room-type={item.type} data-room-id={item.id}><div><h2>{item.name}</h2><p>{item.type === 'CLASS' ? t.classRoom : t.group}</p></div><Button type="button" variant="secondary" onClick={event => { roomOpener.current = {element: event.currentTarget,source: item,scope: focusScope}; setRoom(item); }}>{t.openRoom}</Button></article>) : tab === 'announcements' ? announcements.data.map(item => <article className="community-post" key={item.id}><h2>{item.title}</h2><p className="community-message">{item.body}</p><p className="learning-form__note">{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt))}</p><Status>{item.readAt ? t.read : t.published}</Status>{item.canManage?<AnnouncementMaintenance announcement={item} onChanged={reload}/>:null}</article>) : notifications.data.map(item => <article className="community-post" key={item.id}><h2>{item.title}</h2><Status>{item.readAt ? t.read : t.unread}</Status>{item.kind==='MENTION'?<MentionSource notification={item} onChanged={reload}/>:<NotificationSource notification={item} onChanged={reload}/>}</article>)}{tab !== 'conversations' && !active.loading && !active.error && !active.data.length ? <WorkspaceState kind={!active.loaded||active.nextCursor||active.moreError||active.loadingMore?"unknown":"empty"} icon="community" description={!active.loaded||active.nextCursor||active.moreError||active.loadingMore?t.partialRecords:t.empty}/> : null}{tab !== 'conversations' ? <LoadMore query={active} /> : null}</div>;
}
