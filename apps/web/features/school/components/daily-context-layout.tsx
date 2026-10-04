import type { ReactNode } from 'react';

export function DailyContextLayout({classControl,dateControl}:{classControl:ReactNode;dateControl:ReactNode}){return <div className="school-daily-context-layout"><div>{classControl}</div><div>{dateControl}</div></div>;}
