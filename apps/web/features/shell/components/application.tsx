'use client';

import { useApp } from '../../../shared/session/providers';
import { SignIn } from '../../auth/ui';
import { AccessState } from '../../auth/ui';
import { Workspace } from './workspace';
import type { WorkspaceTheme } from '../theme-model';
import { useWorkspaceTheme } from './workspace-theme';
import dynamic from 'next/dynamic';
import {useEffect,useState} from 'react';
const LocalDemoGuide=dynamic(()=>import('./demo-guide').then(module=>module.DemoGuide),{ssr:false});

export function Application({ initialTheme = 'light' }: { initialTheme?: WorkspaceTheme }) {
  const { status, membership, online, dictionary: t } = useApp();
  const { theme, setTheme } = useWorkspaceTheme(initialTheme);
  const[demoBusy,setDemoBusy]=useState(false),[demoOpen,setDemoOpen]=useState(false);
  const[localPresentation,setLocalPresentation]=useState(false);
  useEffect(()=>{setLocalPresentation(location.protocol==='http:'&&['localhost','127.0.0.1'].includes(location.hostname)&&['3000','54131'].includes(location.port));},[]);
  return <><div data-demo-content data-demo-active={demoOpen||undefined} inert={demoBusy||undefined} className={demoOpen?'demo-content--open':undefined}><a className="skip-link" href="#main-content">{t.skip}</a>{status === 'signed-out' || status === 'not-configured' ? <SignIn /> : status === 'ready' && membership && online ? <Workspace membership={membership} theme={theme} onThemeChange={setTheme} /> : <AccessState />}</div>{localPresentation?<LocalDemoGuide onBusy={setDemoBusy} onOpen={setDemoOpen}/>:null}</>;
}
