'use client';
import {useCallback,useEffect,useRef,useState,type RefObject} from 'react';
import {conversationReadingFocusState,conversationFocusCleanupOwns,type ConversationReadingFocusIntent,type ConversationReadingState} from '../conversation-reading-focus';

export function useConversationReadingFocus(root:RefObject<HTMLElement|null>,scope:string|null,threadKey:string|null){
 const pending=useRef<(ConversationReadingFocusIntent&{opener:HTMLElement;newerFocus:boolean})|null>(null);
 const reading=useRef<ConversationReadingState|null>(null),settle=useRef<(()=>boolean)|null>(null);
 const [attempt,setAttempt]=useState(0);
 const current=useRef({scope,threadKey});current.current={scope,threadKey};
 const cancel=useCallback(()=>{pending.current=null;},[]);
 const request=useCallback((nextThreadKey:string,opener:HTMLElement)=>{pending.current=scope?{scope,threadKey:nextThreadKey,readingScope:null,opener,newerFocus:false}:null;setAttempt(value=>value+1);},[scope]);
 const receive=useCallback((state:ConversationReadingState)=>{reading.current=state;settle.current?.();},[]);
 useEffect(()=>{
  const expected=current.current;
  if(!pending.current||!root.current)return;
  const owned=pending.current;
  const read=()=>{
   const intent=pending.current;if(!intent)return true;
   const matching=reading.current?.threadKey===intent.threadKey;
   const readingScope=matching?reading.current!.readingScope:null;
   if(readingScope&&intent.readingScope===null)intent.readingScope=readingScope;
   const heading=matching?root.current?.querySelector<HTMLElement>('[data-conversation-reading-heading]'):null;
   const active=document.activeElement;
   const decision=conversationReadingFocusState(intent,{scope:current.current.scope,threadKey:current.current.threadKey,readingScope,permitted:current.current.scope!==null,state:matching?reading.current!.state:'loading',newerFocus:intent.newerFocus,openerConnected:intent.opener.isConnected,activeIsOpener:active===intent.opener,activeIsNeutral:active===document.body||active===document.documentElement||active===null,headingAvailable:!!heading&&heading.isConnected});
   if(decision==='cancel'){cancel();return true;}
   if(decision==='focus'&&heading){cancel();heading.focus({preventScroll:true});heading.scrollIntoView({block:'start',behavior:'instant'});return true;}
   return false;
  };
  settle.current=read;
  if(read()){settle.current=null;return;}
  const focusChanged=(event:FocusEvent)=>{const intent=pending.current;if(intent&&event.target!==intent.opener){intent.newerFocus=true;cancel();}};
  const observer=new MutationObserver(()=>{if(read())observer.disconnect();});
  observer.observe(root.current,{subtree:true,childList:true});
  document.addEventListener('focusin',focusChanged);
  return()=>{if(settle.current===read)settle.current=null;observer.disconnect();document.removeEventListener('focusin',focusChanged);if(conversationFocusCleanupOwns(owned,pending.current)&&(current.current.scope!==expected.scope||current.current.threadKey!==expected.threadKey))cancel();};
 },[scope,threadKey,attempt,root,cancel]);
 useEffect(()=>()=>cancel(),[cancel]);
 return{request,cancel,receive};
}
