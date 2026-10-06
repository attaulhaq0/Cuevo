import type { Locale } from '../../shared/i18n/locale';
import type { AdmissionFailure } from './admission';

const copy = {
  en: {
    title: 'School invitation', introduction: 'Join your school workspace', body: 'Only continue if you expected this invitation from your school. Your school checks the approved access before accepting it.',
    safety: 'Opening this page does not accept the invitation. Continue verifies your account and asks the school to accept the approved access.',
    confirmation: 'I expected this school invitation and want to accept the approved access.', continue: 'Continue', checking: 'Checking your account and school invitation…', loading: 'Preparing your invitation…',
    contact: 'If this invitation is unexpected or cannot be confirmed, contact your school administrator for a new invitation. Do not forward your invitation link.', decline: 'Decline invitation', declined: 'Invitation left unaccepted', declinedBody: 'No further acceptance was requested. Contact your school administrator if this invitation was sent in error.',
    accepted: 'School access accepted', acceptedBody: 'Your school confirmed your access. Set a password so you can sign in again.', role: 'School role', unknownRole: 'Role unavailable — contact your school administrator.',
    passwordTitle: 'Set your password', password: 'New password', confirmPassword: 'Confirm password', passwordHint: 'Use at least 12 characters and avoid a password you use elsewhere.', passwordSave: 'Save password', passwordSaving: 'Saving your password…', passwordSaved: 'Password saved', passwordSavedBody: 'You can now open your school workspace and use this password for future sign-in.', open: 'Open workspace', retry: 'Check this admission again', offline: 'You are offline. Connect before continuing.',
    errors: {
      'invalid-link': 'This invitation link is missing or incomplete. Ask your school administrator for a new invitation.',
      'confirmation-required': 'Confirm that you expected this invitation before continuing.',
      'verification-unknown': 'Your account verification is not confirmed. Ask your school administrator to review it and send a new invitation.',
      'expired-link': 'This invitation link has expired or was already used. Ask your school administrator for a new invitation.',
      'session-changed': 'The current account no longer matches this invitation. Contact your school administrator before continuing.',
      'outcome-unknown': 'School access is not confirmed. Keep this page open and check this admission again; do not submit a different invitation.',
      'requires-review': 'The school could not accept this invitation. Contact your school administrator to review the current approval.',
      busy: 'The current request is still being checked.', 'password-invalid': 'Use matching passwords with 12 to 128 characters.', 'password-unknown': 'Password saving is not confirmed. Your school access remains accepted. Enter and save your password again.', unavailable: 'Account services are unavailable. Keep this page open and try again when service returns.',
    }, roles: { admin: 'Administrator', coordinator: 'Coordinator', teacher: 'Teacher', student: 'Student', parent: 'Parent or guardian' },
  },
  ar: {
    title: 'دعوة المدرسة', introduction: 'انضم إلى مساحة مدرستك', body: 'تابع فقط إذا كنت تتوقع هذه الدعوة من مدرستك. تتحقق المدرسة من الوصول المعتمد قبل قبوله.',
    safety: 'فتح هذه الصفحة لا يقبل الدعوة. تتحقق المتابعة من حسابك وتطلب من المدرسة قبول الوصول المعتمد.',
    confirmation: 'كنت أتوقع دعوة المدرسة هذه وأرغب في قبول الوصول المعتمد.', continue: 'متابعة', checking: 'جارٍ التحقق من حسابك ودعوة المدرسة…', loading: 'جارٍ تجهيز دعوتك…',
    contact: 'إذا كانت الدعوة غير متوقعة أو تعذر تأكيدها، تواصل مع مسؤول مدرستك للحصول على دعوة جديدة. لا تشارك رابط الدعوة.', decline: 'رفض الدعوة', declined: 'لم تُقبل الدعوة', declinedBody: 'لم يُطلب قبول إضافي. تواصل مع مسؤول مدرستك إذا أُرسلت الدعوة بالخطأ.',
    accepted: 'تم قبول الوصول إلى المدرسة', acceptedBody: 'أكدت مدرستك وصولك. عيّن كلمة مرور لتتمكن من تسجيل الدخول لاحقًا.', role: 'دورك في المدرسة', unknownRole: 'الدور غير متاح — تواصل مع مسؤول مدرستك.',
    passwordTitle: 'تعيين كلمة المرور', password: 'كلمة المرور الجديدة', confirmPassword: 'تأكيد كلمة المرور', passwordHint: 'استخدم ١٢ حرفًا على الأقل وتجنب كلمة مرور تستخدمها في مكان آخر.', passwordSave: 'حفظ كلمة المرور', passwordSaving: 'جارٍ حفظ كلمة المرور…', passwordSaved: 'تم حفظ كلمة المرور', passwordSavedBody: 'يمكنك الآن فتح مساحة مدرستك واستخدام كلمة المرور هذه لتسجيل الدخول لاحقًا.', open: 'فتح مساحة المدرسة', retry: 'التحقق من هذا القبول مجددًا', offline: 'أنت غير متصل بالإنترنت. اتصل قبل المتابعة.',
    errors: {
      'invalid-link': 'رابط الدعوة مفقود أو غير مكتمل. اطلب دعوة جديدة من مسؤول مدرستك.',
      'confirmation-required': 'أكد أنك كنت تتوقع هذه الدعوة قبل المتابعة.',
      'verification-unknown': 'لم يتأكد التحقق من حسابك. اطلب من مسؤول مدرستك مراجعته وإرسال دعوة جديدة.',
      'expired-link': 'انتهت صلاحية رابط الدعوة أو استُخدم سابقًا. اطلب دعوة جديدة من مسؤول مدرستك.',
      'session-changed': 'الحساب الحالي لم يعد يطابق هذه الدعوة. تواصل مع مسؤول مدرستك قبل المتابعة.',
      'outcome-unknown': 'لم يتأكد الوصول إلى المدرسة. أبقِ هذه الصفحة مفتوحة وتحقق من هذا القبول مجددًا، ولا ترسل دعوة مختلفة.',
      'requires-review': 'تعذر على المدرسة قبول هذه الدعوة. تواصل مع مسؤول مدرستك لمراجعة الموافقة الحالية.',
      busy: 'لا يزال الطلب الحالي قيد التحقق.', 'password-invalid': 'استخدم كلمتي مرور متطابقتين بطول من ١٢ إلى ١٢٨ حرفًا.', 'password-unknown': 'لم يتأكد حفظ كلمة المرور. يبقى وصولك إلى المدرسة مقبولًا. أدخل كلمة المرور واحفظها مجددًا.', unavailable: 'خدمات الحساب غير متاحة. أبقِ الصفحة مفتوحة وحاول مجددًا عند عودة الخدمة.',
    }, roles: { admin: 'مسؤول المدرسة', coordinator: 'منسق', teacher: 'معلم', student: 'طالب', parent: 'ولي أمر' },
  },
};
export function admissionCopy(locale: Locale) { return copy[locale]; }
export function admissionFailureCopy(locale: Locale, failure: AdmissionFailure) { return copy[locale].errors[failure]; }
