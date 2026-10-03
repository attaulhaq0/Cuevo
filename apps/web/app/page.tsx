import { Application } from '../features/shell/ui';
import { cookies } from 'next/headers';
import { workspaceTheme } from '../features/shell/model';

export default async function Home() { return <Application initialTheme={workspaceTheme((await cookies()).get('cuevo_workspace_theme')?.value)} />; }
