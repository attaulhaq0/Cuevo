'use client';
import { useState } from 'react';
import { Button, CuevoIcon, Status } from '@cuevo/ui';
import type { Assessment } from '../model';
import { currentQuizReceipt, currentStudentQuiz, parseQuiz, parseQuizAttempt, parseQuizDefinition } from '../model';
import { LearningApiError } from '../../../shared/api/client';
import { useLearningApi } from '../api';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { CommandForm } from '../../../shared/components/command-form';
import { LearningError } from '../../../shared/components/feedback';
import { LoadMore } from '../../../shared/components/load-more';
import { useApi } from '../../../shared/hooks/use-api';
import { useApp } from '../../../shared/session/providers';
import { versionLabel } from '../../../shared/i18n/version-label';

export function QuizWorkspace({ assessment, author, onChanged }: { assessment: Assessment; author: boolean; onChanged: () => void }) {
  const { locale, membership, formDrafts } = useApp();
  const { journal } = useApi();
  const retainedDraft = !!formDrafts.get(`${membership?.schoolId}:${membership?.userId}:/v1/assessments/${assessment.id}/quiz`);
  const { t } = useLearningApi(); const [open, setOpen] = useState(retainedDraft); const [create, setCreate] = useState(retainedDraft); const [refresh, setRefresh] = useState(0);
  const versions = usePaginatedLearningQuery(author && open ? `/v1/assessments/${assessment.id}/quiz-authoring?limit=100` : null, parseQuizDefinition, refresh);
  const quiz = useApiQuery(!author && assessment.submissionKind === 'QUIZ' ? `/v1/assessments/${assessment.id}/quiz` : null, parseQuiz, refresh);
  const attempts = usePaginatedLearningQuery(!author && assessment.submissionKind === 'QUIZ' ? `/v1/assessments/${assessment.id}/quiz/attempts?limit=100` : null, parseQuizAttempt, refresh);
  function saved() { setCreate(false); setRefresh(value => value + 1); onChanged(); }
  function definitionSaved() { setCreate(false); setRefresh(value => value + 1); }
  if (author) return <section><Button type="button" variant="quiet" onClick={() => setOpen(value => !value)} aria-expanded={open}>{t.authorQuiz}</Button>{open ? <><Button type="button" variant="secondary" onClick={() => setCreate(true)}>{t.createQuiz}</Button>{create ? <QuizEditor assessmentId={assessment.id} onSaved={definitionSaved} onCancel={() => setCreate(false)} /> : null}{versions.error ? <LearningError error={versions.error} /> : versions.loading ? <p role="status">{t.loading}</p> : versions.data.map(version => <article key={version.id} className="submission-history-row"><h4>{t.quizVersion}: {versionLabel(version.version, locale)}</h4>{version.questions.map(question => <div key={question.key}><p>{question.prompt}</p><ul>{question.options.map(option => <li key={option.key}>{option.label}</li>)}</ul><p className="learning-form__note">{t.correctAnswer}: {question.options.find(option => option.key === question.correctOptionKey)?.label ?? t.noQuiz}</p></div>)}{!version.published ? <CommandForm title={t.publishQuiz} path={`/v1/assessments/${assessment.id}/quiz/publish`} fields={[]} body={() => ({ quizId: version.id, expectedPolicyVersion: assessment.policyVersion })} onSaved={saved} actionLabel={t.publishQuiz} note={t.quizPublishNote} /> : <Status>{t.published}</Status>}</article>)}<LoadMore query={versions} /></> : null}</section>;
  if (quiz.loading || attempts.loading) return <p role="status" data-work-loading="true">{t.loading}</p>;
  if (quiz.error || attempts.error) return <LearningError error={(quiz.error ?? attempts.error)!} />;
  let currentQuiz;
  try { currentQuiz = currentStudentQuiz(quiz.data, attempts.data, assessment.id, membership?.userId); } catch { return <LearningError error={new LearningApiError('invalid')} />; }
  return <section className="quiz-work" aria-label={attempts.data.length ? t.quizCheckedWork : t.quizWork}>
    <div className="submission-work-heading"><CuevoIcon name="assessment" variant="filled" size={26} /><h4>{attempts.data.length ? t.quizCheckedWork : t.quizWork}</h4></div><p className="learning-form__note">{t.quizNote}</p>
    {currentQuiz && !attempts.data.length ? <CommandForm title={t.quizQuestions} path={`/v1/assessments/${assessment.id}/quiz/attempts`} fields={currentQuiz.questions.map(question => ({ name: question.key, label: question.prompt, type: 'select' as const, required: true, options: question.options.map(option => ({ value: option.key, label: option.label })) }))} body={values => ({ quizId: currentQuiz.id, answers: currentQuiz.questions.map(question => ({ questionKey: question.key, optionKey: String(values.get(question.key)) })) })} onSaved={result => { const command = journal.get(`/v1/assessments/${assessment.id}/quiz/attempts`); if (!command) throw new LearningApiError('invalid', true); currentQuizReceipt(result, currentQuiz, membership?.userId, command.body); saved(); }} actionLabel={t.submitQuiz} /> : null}
    {!currentQuiz ? <p className="notice">{t.noQuiz}</p> : null}
    {attempts.data.map(attempt => <article className="submission-history-row quiz-checked-work" key={attempt.id}><div className="submission-work-heading"><Status tone="neutral">{t.checkedNotGraded}</Status><p><bdi>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(attempt.createdAt))}</bdi></p></div><ol>{attempt.checkedAnswers.map(answer => <li key={answer.questionKey}><p dir="auto">{currentQuiz?.questions.find(question => question.key === answer.questionKey)?.prompt ?? t.question}</p><Status tone={answer.status === 'CORRECT' ? 'positive' : 'warning'}>{answer.status === 'CORRECT' ? t.correct : t.incorrect}</Status></li>)}</ol><p className="learning-form__note">{t.quizNote}</p></article>)}<LoadMore query={attempts} />
  </section>;
}

type QuizWorkingModel = { version: string; questions: { id: string; options: string[] }[] };
function QuizEditor({ assessmentId, onSaved, onCancel }: { assessmentId: string; onSaved: () => void; onCancel: () => void }) {
  const { membership, formDrafts } = useApp();
  const workingSlot = `${membership?.schoolId}:${membership?.userId}:/v1/assessments/${assessmentId}/quiz`;
  const working = formDrafts.get(workingSlot);
  const { t } = useLearningApi();
  const [model, setModel] = useState<QuizWorkingModel>(() => formDrafts.model<QuizWorkingModel>(workingSlot) ?? { version: `school-${new Date().toISOString()}`, questions: [{ id: 'q0', options: ['o0', 'o1'] }] });
  const { questions, version } = model;
  function setQuestions(update: (previous: QuizWorkingModel['questions']) => QuizWorkingModel['questions']) { setModel(previous => { const next = { ...previous, questions: update(previous.questions) }; formDrafts.saveModel(workingSlot, next); return next; }); }
  const { journal } = useApi();
  const [labels, setLabels] = useState<Record<string, string>>(() => Object.fromEntries(questions.flatMap(question => question.options.map(option => [option, String(working?.values[`${option}:label`] ?? '')]))));
  return <div><CommandForm title={t.createQuiz} path={`/v1/assessments/${assessmentId}/quiz`} fields={questions.flatMap((question, index) => [{ name: `${question.id}:prompt`, label: `${t.questionPrompt} ${index + 1}`, type: 'textarea' as const, required: true, maxLength: 4000 }, ...question.options.map((option, optionIndex) => ({ name: `${option}:label`, label: `${t.optionLabel} ${index + 1}.${optionIndex + 1}`, required: true, maxLength: 2000 })), { name: `${question.id}:correct`, label: `${t.correctAnswer} ${index + 1}`, type: 'select' as const, required: true, options: question.options.map((option, optionIndex) => ({ value: option, label: labels[option] || `${t.option} ${optionIndex + 1}` })) }])} onValuesChange={values => { formDrafts.saveModel(workingSlot, model); setLabels(Object.fromEntries(questions.flatMap(question => question.options.map(option => [option, String(values.get(`${option}:label`) ?? '')])))); }} body={values => ({ version, questions: questions.map(question => ({ key: question.id, prompt: String(values.get(`${question.id}:prompt`)), options: question.options.map(option => ({ key: option, label: String(values.get(`${option}:label`)) })), correctOptionKey: String(values.get(`${question.id}:correct`)) })) })} onSaved={onSaved} onCancel={onCancel} note={t.quizPublishNote} /><div className="learning-actions"><Button type="button" variant="secondary" disabled={questions.length >= 30} onClick={() => { if (!journal.get(`/v1/assessments/${assessmentId}/quiz`)) setQuestions(items => [...items, { id: crypto.randomUUID(), options: [crypto.randomUUID(), crypto.randomUUID()] }]); }}>{t.addQuestion}</Button>{questions.map((question, index) => <Button type="button" key={question.id} variant="quiet" disabled={question.options.length >= 10} onClick={() => { if (!journal.get(`/v1/assessments/${assessmentId}/quiz`)) setQuestions(items => items.map(item => item.id === question.id ? { ...item, options: [...item.options, crypto.randomUUID()] } : item)); }}>{t.addOption} {index + 1}</Button>)}</div></div>;
}
