'use client';
import { useState } from 'react';
import { Button, CuevoIcon, type CuevoIconName } from '@cuevo/ui';

export type DemoPillarScene = 'learning-loop' | 'rubric' | 'self-regulation' | 'institution' | 'signals';
const copy = {
  en: {
    label: 'Presentation illustration',
    note: 'An illustrated learning journey. These views explain the experience; they do not save work, assign a rubric result or measure a learner’s traits.',
    loopTitle: 'One connected learning journey',
    loopIntro: 'Bring the learning goal, thinking, feedback and next action together—so the learner knows what to try next.',
    loop: [
      ['A clear goal', 'Know what you are trying to learn.', 'Outcome-based learning', 'learning'],
      ['Meaningful work', 'Explain, apply and check an idea.', 'Bloom’s task focus', 'practice'],
      ['Teacher feedback', 'Use criteria and evidence to guide the next step.', 'Rubrics and assessment', 'assessment'],
      ['Learner reflection', 'Notice what worked and what to change.', 'Self-regulation and habits', 'portfolio'],
      ['An approved next step', 'Intelligence proposes; the teacher decides.', 'E Deviser Intelligence', 'person'],
      ['New evidence', 'Try the next practice and review the follow-up.', 'Reassessment and outcome', 'progress'],
    ],
    thinking: 'Different kinds of thinking',
    thinkingNote: 'Bloom’s categories describe a task’s thinking demand. They are not a child’s level or a ladder to unlock.',
    blooms: ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'],
    rubricTitle: 'Make the expectations visible',
    rubricIntro: 'An illustrative school-authored rubric gives feedback a clear structure. No level is selected for this learner.',
    criterion: 'Criterion', level: 'Descriptor', looks: 'What the teacher looks for',
    rubricRows: [
      ['Explanation', 'Developing', 'Explain a relevant step.'],
      ['Explanation', 'Secure', 'Explain connected steps.'],
      ['Checking', 'Not demonstrated', 'Checking was not demonstrated in this work.'],
      ['Checking', 'Demonstrated', 'Show a relevant check.'],
    ],
    rubricFooter: 'Example: School explanation descriptors. A teacher reviews the work, records the appropriate criteria and releases feedback. The tour’s numeric result is a separate assessment record.',
    regulationTitle: 'Help the learner steer their next step',
    regulationIntro: 'A repeatable learning cycle, supported by explicit prompts and teacher feedback.',
    stages: ['Plan', 'Monitor', 'Reflect / Evaluate', 'Adapt'],
    stageTitles: ['Choose one manageable goal', 'Check while you work', 'Explain what changed', 'Choose the next strategy'],
    stageBodies: [
      'Example goal: Explain one clear checking step. Write the method, check one step, and ask for feedback when uncertain.',
      'Compare the work with the task instructions and rubric. Notice where a teacher’s explanation or a worked example would help.',
      'Keep an explanation and reflection with the work. What did you check? What would you try differently?',
      'Try a teacher-approved next practice, then review new evidence. A new result can guide the next plan without proving what caused the change.',
    ],
    fogg: 'Make the action manageable',
    foggBody: 'B.J. Fogg is a design lens: a small accessible action and a useful prompt. Practice, revision and reflection can be recorded separately from grades; motivation and personality are not scored.',
    institutionTitle: 'One product, configured for the institution',
    institutionIntro: 'School choices give the same learning journey its context. This illustration is not a live configuration form.',
    institutionCards: [
      ['School and people', 'Classes, teaching assignments and family relationships determine who can see and act on each source.', 'school'],
      ['Curriculum context', 'Use versioned, school-approved objectives and rubrics. Programme, jurisdiction and accreditation stay separate; official content needs verified sources and rights.', 'curriculum'],
      ['Selected modules and policies', 'Enabled modules, observation windows and learning-action recognition follow school configuration. One product and one learning loop remain underneath.', 'settings'],
      ['Review and approval', 'The school defines authorized reviewers. Teachers retain grading and consequential learning decisions; intelligence provides proposals.', 'shield'],
    ],
    institutionFooter: 'Institutions can adapt approved context and policies without copying the app. This view does not claim unrestricted curriculum import, automatic accreditation or every module being customer-ready.',
    signalsTitle: 'From a recorded action to an informed decision',
    signalsIntro: 'Illustrated event flow: connect new evidence to the current learning source, then surface a reviewed next action.',
    signalsCards: [
      ['A source changes', 'A learner submits work, records practice or receives released feedback.', 'practice'],
      ['The event is retained', 'The authorized change and durable event keep their source context together.', 'progress'],
      ['Processing uses relevant context', 'The existing processor can update derived state. Authorized intelligence retrieves permitted evidence for a bounded proposal.', 'learning'],
      ['A human reviews the next step', 'Teachers review consequential proposals; coordinators and families see only their permitted context.', 'person'],
    ],
    signalsFooter: 'Near-real-time is an intended delivery experience, not a measured latency promise in this presentation. This diagram does not activate processing, live AI, external alerts or an institution-wide analytics dashboard.',
  },
  ar: {
    label: 'تصوّر توضيحي للعرض',
    note: 'تصوّر لمسار التعلّم يشرح التجربة؛ لا يحفظ عملًا ولا يختار تقديرًا للطالب ولا يقيس سماته.',
    loopTitle: 'رحلة تعلّم واحدة مترابطة',
    loopIntro: 'اجمع هدف التعلّم والتفكير والملاحظات والخطوة التالية، ليعرف الطالب ما الذي يمكنه تجربته.',
    loop: [
      ['هدف واضح', 'اعرف ما الذي تحاول تعلّمه.', 'التعلّم القائم على النتائج', 'learning'],
      ['عمل ذو معنى', 'اشرح فكرة وطبّقها وتحقّق منها.', 'تركيز المهمة وفق بلوم', 'practice'],
      ['ملاحظات المعلّم', 'استرشد بالمعايير والشواهد للخطوة التالية.', 'محكّات التقدير والتقييم', 'assessment'],
      ['تأمّل الطالب', 'لاحظ ما نجح وما يحتاج إلى تغيير.', 'التنظيم الذاتي والعادات', 'portfolio'],
      ['خطوة تالية معتمدة', 'تقترح طبقة الذكاء ويقرّر المعلّم.', 'ذكاء إي ديفايزر', 'person'],
      ['شواهد جديدة', 'جرّب التدريب التالي وراجع المتابعة.', 'إعادة التقييم والنتيجة', 'progress'],
    ],
    thinking: 'أنواع مختلفة من التفكير',
    thinkingNote: 'تصف فئات بلوم التفكير المطلوب في المهمة؛ لا تمثّل مستوى للطفل أو سلّمًا يجب فتح مراحله.',
    blooms: ['التذكّر', 'الفهم', 'التطبيق', 'التحليل', 'التقييم', 'الإبداع'],
    rubricTitle: 'اجعل التوقّعات واضحة',
    rubricIntro: 'مثال لمحكّات تقدير أعدّتها المدرسة يجعل الملاحظات أوضح. لم يُختَر أي تقدير لهذا الطالب.',
    criterion: 'المعيار', level: 'الوصف', looks: 'ما يبحث عنه المعلّم',
    rubricRows: [
      ['الشرح', 'في طور التطوّر', 'اشرح خطوة ذات صلة.'],
      ['الشرح', 'متمكّن', 'اشرح خطوات مترابطة.'],
      ['التحقّق', 'غير ظاهر في العمل', 'لم يظهر التحقّق في هذا العمل.'],
      ['التحقّق', 'ظاهر في العمل', 'أظهر تحقّقًا ذا صلة.'],
    ],
    rubricFooter: 'مثال: أوصاف الشرح التي أعدّتها المدرسة. يراجع المعلّم العمل ويسجّل المعايير المناسبة ويصدر الملاحظات. النتيجة الرقمية في العرض سجلّ تقييم منفصل.',
    regulationTitle: 'ساعد الطالب على توجيه خطوته التالية',
    regulationIntro: 'دورة تعلّم قابلة للتكرار تدعمها إرشادات واضحة وملاحظات المعلّم.',
    stages: ['خطّط', 'راقب', 'تأمّل / قيّم', 'عدّل'],
    stageTitles: ['اختر هدفًا صغيرًا واضحًا', 'تحقّق أثناء العمل', 'اشرح ما تغيّر', 'اختر الاستراتيجية التالية'],
    stageBodies: [
      'هدف توضيحي: شرح خطوة تحقّق واضحة. اكتب الطريقة وتحقّق من خطوة واطلب الملاحظات عند عدم اليقين.',
      'قارن العمل بتعليمات المهمة ومحكّات التقدير. حدّد أين يمكن أن يساعدك شرح المعلّم أو مثال محلول.',
      'احتفظ بالشرح والتأمّل مع العمل. ما الذي تحقّقت منه؟ وما الذي ستجرّبه بطريقة مختلفة؟',
      'جرّب تدريبًا تاليًا اعتمده المعلّم ثم راجع شواهد جديدة. قد توجّه النتيجة الخطة التالية دون إثبات سبب التغيّر.',
    ],
    fogg: 'اجعل الفعل ميسّرًا',
    foggBody: 'نموذج بي جي فوغ إطار للتصميم: فعل صغير ومتاح وإشارة مفيدة. يمكن تسجيل التدريب والمراجعة والتأمّل منفصلة عن الدرجات؛ لا تُمنح درجات للدافعية أو الشخصية.',
    institutionTitle: 'منتج واحد يُضبط وفق المؤسسة',
    institutionIntro: 'تمنح اختيارات المدرسة رحلة التعلّم سياقها. هذا تصوّر توضيحي وليس نموذج إعدادات حيًا.',
    institutionCards: [
      ['المدرسة والأشخاص', 'تحدّد الصفوف وإسنادات المعلّمين والعلاقات الأسرية من يمكنه قراءة كل مصدر والتعامل معه.', 'school'],
      ['سياق المنهج', 'استخدم أهدافًا ومحكّات تقدير ذات إصدارات تعتمدها المدرسة. يظل البرنامج والاختصاص والاعتماد محاور منفصلة؛ يتطلّب المحتوى الرسمي مصادر وحقوقًا موثّقة.', 'curriculum'],
      ['الوحدات والسياسات المختارة', 'تتبع الوحدات المفعّلة وفترات الملاحظة وتقدير أنشطة التعلّم إعدادات المدرسة. يبقى المنتج ومسار التعلّم واحدًا.', 'settings'],
      ['المراجعة والاعتماد', 'تحدّد المدرسة المراجعين المخوّلين. يحتفظ المعلّم بالتقدير والقرارات المؤثّرة؛ وتقدّم طبقة الذكاء مقترحات.', 'shield'],
    ],
    institutionFooter: 'تستطيع المؤسسة تكييف السياق والسياسات المعتمدة دون نسخ التطبيق. لا يدّعي العرض استيراد أي منهج بلا قيود أو اعتمادًا تلقائيًا أو جاهزية جميع الوحدات للعملاء.',
    signalsTitle: 'من الفعل المسجّل إلى قرار مستنير',
    signalsIntro: 'تصوّر لمسار الأحداث: اربط الشواهد الجديدة بمصدر التعلّم ثم اعرض خطوة تالية مراجَعة.',
    signalsCards: [
      ['يتغيّر المصدر', 'يسلّم الطالب عملًا أو يسجّل تدريبًا أو يتلقّى ملاحظات صادرة.', 'practice'],
      ['يُحتفَظ بالحدث', 'يحافظ التغيير المخوّل والحدث الدائم على سياق المصدر معًا.', 'progress'],
      ['تستخدم المعالجة سياقًا مناسبًا', 'يمكن للمعالج القائم تحديث الحالة المشتقّة. تسترجع طبقة الذكاء المخوّلة شواهد مسموحة لمقترح محدّد.', 'learning'],
      ['يراجع الإنسان الخطوة التالية', 'يراجع المعلّم المقترحات المؤثّرة؛ ويرى المنسّق والأسرة سياقهما المسموح فقط.', 'person'],
    ],
    signalsFooter: 'التحديث القريب من الوقت الحقيقي تجربة مستهدفة، وليس وعدًا بزمن مقاس في العرض. لا يفعّل هذا الرسم معالجة أو ذكاءً حيًا أو تنبيهات خارجية أو لوحة تحليلات للمؤسسة.',
  },
} as const;

export function DemoLearningPillars({ scene, locale }: { scene: DemoPillarScene; locale: 'en' | 'ar' }) {
  const t = copy[locale], [stage, setStage] = useState(0);
  const title = scene === 'learning-loop' ? t.loopTitle : scene === 'rubric' ? t.rubricTitle : scene === 'institution' ? t.institutionTitle : scene === 'signals' ? t.signalsTitle : t.regulationTitle;
  return <section className="demo-pillars" data-presentation-pillars={scene} lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} aria-label={title}>
    <p className="demo-pillars__label">{t.label}</p><h1>{title}</h1>
    <p className="demo-pillars__intro">{scene === 'learning-loop' ? t.loopIntro : scene === 'rubric' ? t.rubricIntro : scene === 'institution' ? t.institutionIntro : scene === 'signals' ? t.signalsIntro : t.regulationIntro}</p>
    {scene === 'learning-loop' ? <>
      <ol className="demo-pillars__loop">{t.loop.map(([heading, body, pillar, icon], index) => <li key={heading}><article>
        <div className="demo-pillars__card-top"><CuevoIcon name={icon as CuevoIconName} size={32} /><span>{new Intl.NumberFormat(locale).format(index + 1)}</span></div>
        <h2>{heading}</h2><p>{body}</p><small>{pillar}</small>
      </article></li>)}</ol>
      <section className="demo-pillars__thinking"><h2>{t.thinking}</h2><ul>{t.blooms.map(name => <li key={name}>{name}</li>)}</ul><p>{t.thinkingNote}</p></section>
    </> : scene === 'rubric' ? <>
      <div className="demo-pillars__table"><table><thead><tr><th scope="col">{t.criterion}</th><th scope="col">{t.level}</th><th scope="col">{t.looks}</th></tr></thead>
        <tbody>{t.rubricRows.map(([criterion, level, description]) => <tr key={criterion + level}><th scope="row">{criterion}</th><td>{level}</td><td>{description}</td></tr>)}</tbody></table></div><p className="demo-pillars__context">{t.rubricFooter}</p>
    </> : scene === 'institution' || scene === 'signals' ? <>
      <ol className="demo-pillars__loop demo-pillars__loop--four">{(scene === 'institution' ? t.institutionCards : t.signalsCards).map(([heading, body, icon], index) => <li key={heading}><article><div className="demo-pillars__card-top"><CuevoIcon name={icon as CuevoIconName} size={32} /><span>{new Intl.NumberFormat(locale).format(index + 1)}</span></div><h2>{heading}</h2><p>{body}</p></article></li>)}</ol>
      <p className="demo-pillars__context">{scene === 'institution' ? t.institutionFooter : t.signalsFooter}</p>
    </> : <>
      <div className="demo-pillars__stages" role="group" aria-label={t.regulationTitle}>{t.stages.map((name, index) => <Button type="button" variant="secondary" aria-pressed={stage === index} key={name} onClick={() => setStage(index)}>{name}</Button>)}</div>
      <article className="demo-pillars__reflection" aria-live="polite"><CuevoIcon name={(['learning', 'assessment', 'portfolio', 'practice'] as const)[stage]} size={40} /><h2>{t.stageTitles[stage]}</h2><p>{t.stageBodies[stage]}</p></article>
      <aside className="demo-pillars__context"><h2>{t.fogg}</h2><p>{t.foggBody}</p></aside>
    </>}
    <p className="demo-pillars__notice">{t.note}</p>
  </section>;
}
