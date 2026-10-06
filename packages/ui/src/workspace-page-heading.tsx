'use client';

import { type ReactNode, type Ref } from 'react';

type WorkspacePageHelp = { helpLabel: string; help: ReactNode };

/** One optional explanation after current content. Record identity/actions stay with the feature. */
export function WorkspacePageProvider({ helpLabel, help, children }: WorkspacePageHelp & { children: ReactNode }) {
  return <>{children}{help ? <details className="workspace-page-help"><summary>{helpLabel}</summary><div>{help}</div></details> : null}</>;
}

/** One current content h1, authored directly from the owner's admitted source. */
export function WorkspacePageHeading({ title, caption, description, actions, headingRef }: { title: ReactNode; caption?: ReactNode; description?: ReactNode; actions?: ReactNode; headingRef?: Ref<HTMLHeadingElement> }) {
  return <header className="workspace-page-heading">
    <div className="workspace-page-heading__content">
      {caption ? <p className="workspace-page-heading__caption">{caption}</p> : null}
      <h1 ref={headingRef} tabIndex={-1}>{title}</h1>
      {description ? <div className="workspace-page-heading__description">{description}</div> : null}
    </div>
    {actions ? <div className="workspace-page-heading__actions">{actions}</div> : null}
  </header>;
}
