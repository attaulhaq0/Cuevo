import type { ReactNode } from 'react';

export function StudentActivityReading({work,materials}:{work:ReactNode;materials:ReactNode}){
 return <div className="student-activity-reading"><div className="student-activity-reading__work">{work}</div><div className="student-activity-reading__materials">{materials}</div></div>;
}
export function ActivitySourceReading({openTask,title,instructions,work,materials,sourceLabel}:{openTask:boolean;title:ReactNode;instructions:ReactNode;work:ReactNode;materials:ReactNode;sourceLabel:string}){const source=<div key="activity-source" className="activity-source-reading__source">{openTask?<details><summary>{sourceLabel}</summary>{title}{instructions}</details>:<>{title}{instructions}</>}</div>;const selectedWork=<div key="activity-work" className="activity-source-reading__work">{work}</div>;return <div className="activity-source-reading" data-task-open={openTask}>{openTask?[selectedWork,source]:[source,selectedWork]}<div key="activity-materials" className="activity-source-reading__materials">{materials}</div></div>;}
