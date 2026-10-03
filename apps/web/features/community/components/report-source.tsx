import type { ReportSourceContext } from '../model';
import { maintenanceAr, maintenanceEn } from '../maintenance-messages';

export function ReportSourceView({source,locale}:{source:ReportSourceContext;locale:'en'|'ar'}) {
 const t=locale==='ar'?maintenanceAr:maintenanceEn;
 return <section className="community-report-source"><h3>{t.reportedMessage}</h3>{source.state==='NOT_LOADED'?<p className="notice" role="status">{t.reportSourceUnavailable}</p>:<><p><bdi>{source.post.authorName}</bdi> · <time dateTime={source.post.createdAt}><bdi>{new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(source.post.createdAt))} · UTC</bdi></time></p>{source.state==='HIDDEN'?<p>{t.reportSourceHidden}</p>:<p className="community-message" dir="auto">{source.post.body}</p>}</>}</section>;
}
