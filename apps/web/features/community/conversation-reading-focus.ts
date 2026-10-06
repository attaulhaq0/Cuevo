export type ConversationReadingFocusIntent = { scope:string; threadKey:string; readingScope:string|null };
export type ConversationReadingState = {threadKey:string;readingScope:string|null;state:'loading'|'ready'|'error'};
export function conversationReadingKey(thread:{id:string;learnerId:string;parentId:string;teacherId:string;classId:string;subjectId:string}):string{return JSON.stringify([thread.id,thread.learnerId,thread.parentId,thread.teacherId,thread.classId,thread.subjectId]);}
export function conversationFocusCleanupOwns<T>(owned:T|null,current:T|null):boolean{return owned!==null&&owned===current;}
export type ConversationReadingFocusCurrent = { scope:string|null; threadKey:string|null; readingScope:string|null; permitted:boolean; state:'loading'|'ready'|'error'; newerFocus:boolean; openerConnected:boolean; activeIsOpener:boolean; activeIsNeutral:boolean; headingAvailable:boolean };

/** An explicit Open can wait for its exact private reads; refresh is never a new intent. */
export function conversationReadingFocusState(intent:ConversationReadingFocusIntent|null,current:ConversationReadingFocusCurrent):'cancel'|'wait'|'focus' {
 if(!intent||intent.scope!==current.scope||intent.threadKey!==current.threadKey||!current.permitted||current.state==='error'||current.newerFocus||!current.activeIsOpener&&(!current.activeIsNeutral||current.openerConnected)||intent.readingScope!==null&&intent.readingScope!==current.readingScope)return'cancel';
 return current.readingScope&&current.state==='ready'&&current.headingAvailable?'focus':'wait';
}
