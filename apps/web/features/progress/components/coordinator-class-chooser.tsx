'use client';
import {useEffect,useState,type ReactNode} from 'react';

/** Contains the current class owner's rows and controls; it creates no selection or source authority. */
export function CoordinatorClassChooser({enabled=true,sourceKey,selectedLearnerId,selectedLabel,label,children}:{enabled?:boolean;sourceKey:string;selectedLearnerId:string|null;selectedLabel:string|null;label:string;children:ReactNode}){
 const [open,setOpen]=useState(true);
 useEffect(()=>{
  if(!enabled)return;
  const media=window.matchMedia('(max-width:767px)');
  const update=()=>setOpen(!selectedLearnerId||!media.matches);
  update();media.addEventListener('change',update);
  return()=>media.removeEventListener('change',update);
 },[enabled,sourceKey,selectedLearnerId]);
 if(!enabled)return <>{children}</>;
 return <details className="coordinator-class-chooser" open={open} onToggle={event=>setOpen(event.currentTarget.open)}><summary><span>{label}</span>{selectedLearnerId&&selectedLabel?<bdi>{selectedLabel}</bdi>:null}</summary><div className="coordinator-class-chooser__records">{children}</div></details>;
}
