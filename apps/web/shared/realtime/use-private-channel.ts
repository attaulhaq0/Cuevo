'use client';
import{useEffect,useRef,useState}from'react';import{createAuthClient}from'../session/supabase';import{useApp}from'../session/providers';
export function usePrivateChannel(topic:string|null,onInvalidate:()=>void){
 const{publicConfig,accessToken,membership,online,refreshAccess}=useApp();const callback=useRef(onInvalidate);callback.current=onInvalidate;
 const[state,setState]=useState<'connecting'|'connected'|'offline'|'unavailable'>('unavailable');
 useEffect(()=>{if(!topic||!accessToken||!membership){setState('unavailable');return;}if(!online){setState('offline');return;}if(!new RegExp(`^cuevo:${membership.schoolId}:room:[0-9a-f-]{36}$`,'i').test(topic)){setState('unavailable');return;}
  const client=createAuthClient(publicConfig);if(!client){setState('unavailable');return;}let active=true;setState('connecting');
  const channel=client.channel(topic,{config:{private:true}}).on('broadcast',{event:'invalidate'},()=>{if(active){refreshAccess();callback.current();}});
  void client.realtime.setAuth(accessToken).then(()=>{if(active)channel.subscribe(status=>{if(active){setState(status==='SUBSCRIBED'?'connected':status==='TIMED_OUT'||status==='CHANNEL_ERROR'||status==='CLOSED'?'unavailable':'connecting');if(status==='SUBSCRIBED')callback.current();}});}).catch(()=>{if(active)setState('unavailable');});
  return()=>{active=false;void client.removeChannel(channel);};
 },[topic,accessToken,membership?.schoolId,membership?.userId,online,publicConfig,refreshAccess]);
 return state;
}
