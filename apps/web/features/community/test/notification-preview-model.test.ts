import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notificationPreviewTitle, parseNotificationPreviewPage } from '../notification-preview-model.ts';
const notification = { id:'10000000-0000-4000-8000-000000000001',announcementId:'10000000-0000-4000-8000-000000000001',kind:'ANNOUNCEMENT',title:'School reading afternoon',createdAt:'2026-10-13T12:00:00Z',readAt:null };
test('preview refuses a larger or duplicate source page without claiming a latest subset',()=>{
  assert.equal(parseNotificationPreviewPage({items:[notification],nextCursor:null},false).items.length,1);
  assert.throws(()=>parseNotificationPreviewPage({items:Array.from({length:6},(_,n)=>({...notification,id:`10000000-0000-4000-8000-${String(n+1).padStart(12,'0')}`})),nextCursor:null},false));
  assert.throws(()=>parseNotificationPreviewPage({items:[notification,notification],nextCursor:null},false));
  assert.throws(()=>parseNotificationPreviewPage({items:[],nextCursor:'wrong'},false));
});
test('parent preview preserves announcement-only authority and refuses mentions',()=>{
  assert.equal(parseNotificationPreviewPage({items:[notification],nextCursor:null},true).items[0].kind,'ANNOUNCEMENT');
  const mention={id:notification.id,postId:notification.id,roomId:notification.id,title:'Class group',kind:'MENTION',createdAt:notification.createdAt,readAt:null};
  assert.throws(()=>parseNotificationPreviewPage({items:[mention],nextCursor:null},true));
  assert.equal(parseNotificationPreviewPage({items:[mention],nextCursor:null},false).items[0].kind,'MENTION');
});
test('unknown and opaque titles stay localized without showing internal keys',()=>{
  for(const value of ['',notification.id,'a'.repeat(40),'a'.repeat(64),'x'.repeat(201)]){
    assert.equal(notificationPreviewTitle(value,'en'),'Notification title unavailable');
    assert.equal(notificationPreviewTitle(value,'ar'),'عنوان الإشعار غير متاح');
  }
  assert.equal(notificationPreviewTitle('  School reading afternoon  ','en'),'School reading afternoon');
});
