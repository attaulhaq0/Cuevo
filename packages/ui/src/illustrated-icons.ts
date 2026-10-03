import arrowArtwork from './assets/icons/arrow.webp';
import chevronArtwork from './assets/icons/chevron.webp';
import learningArtwork from './assets/icons/learning.webp';
import helpArtwork from './assets/icons/help.webp';
import eyeArtwork from './assets/icons/eye.webp';
import eyeOffArtwork from './assets/icons/eyeOff.webp';
import languageArtwork from './assets/icons/language.webp';
import studentArtwork from './assets/icons/student.webp';
import parentArtwork from './assets/icons/parent.webp';
import deviceArtwork from './assets/icons/device.webp';
import lockArtwork from './assets/icons/lock.webp';
import emailArtwork from './assets/icons/email.webp';
import feedbackArtwork from './assets/icons/feedback.webp';
import practiceArtwork from './assets/icons/practice.webp';
import schoolArtwork from './assets/icons/school.webp';
import shieldArtwork from './assets/icons/shield.webp';
import progressArtwork from './assets/icons/progress.webp';
import milestonesArtwork from './assets/icons/milestones.webp';
import personArtwork from './assets/icons/person.webp';
import peopleArtwork from './assets/icons/people.webp';
import homeArtwork from './assets/icons/home.webp';
import communityArtwork from './assets/icons/community.webp';
import portfolioArtwork from './assets/icons/portfolio.webp';
import assessmentArtwork from './assets/icons/assessment.webp';
import developmentArtwork from './assets/icons/development.webp';
import curriculumArtwork from './assets/icons/curriculum.webp';
import settingsArtwork from './assets/icons/settings.webp';
import notificationArtwork from './assets/icons/notification.webp';
import searchArtwork from './assets/icons/search.webp';
import calendarArtwork from './assets/icons/calendar.webp';
import goalArtwork from './assets/icons/goal.webp';
import reflectionArtwork from './assets/icons/reflection.webp';
import closeArtwork from './assets/icons/close.webp';
import checkArtwork from './assets/icons/check.webp';
import refreshArtwork from './assets/icons/refresh.webp';
import logoutArtwork from './assets/icons/logout.webp';
import offlineArtwork from './assets/icons/offline.webp';
import shieldAlertArtwork from './assets/icons/shieldAlert.webp';

/** One optically padded public illustration per semantic icon. */
function imageSource(image: string | { src: string }): string {
  // Next imports image metadata, while Vite/Vitest import the same bytes as URLs.
  return typeof image === 'string' ? image : image.src;
}
export const cuevoIllustratedIcons = {
  arrow: imageSource(arrowArtwork),
  chevron: imageSource(chevronArtwork),
  learning: imageSource(learningArtwork),
  help: imageSource(helpArtwork),
  eye: imageSource(eyeArtwork),
  eyeOff: imageSource(eyeOffArtwork),
  language: imageSource(languageArtwork),
  student: imageSource(studentArtwork),
  parent: imageSource(parentArtwork),
  device: imageSource(deviceArtwork),
  lock: imageSource(lockArtwork),
  email: imageSource(emailArtwork),
  feedback: imageSource(feedbackArtwork),
  practice: imageSource(practiceArtwork),
  school: imageSource(schoolArtwork),
  shield: imageSource(shieldArtwork),
  progress: imageSource(progressArtwork),
  milestones: imageSource(milestonesArtwork),
  person: imageSource(personArtwork),
  people: imageSource(peopleArtwork),
  home: imageSource(homeArtwork),
  community: imageSource(communityArtwork),
  portfolio: imageSource(portfolioArtwork),
  assessment: imageSource(assessmentArtwork),
  development: imageSource(developmentArtwork),
  curriculum: imageSource(curriculumArtwork),
  settings: imageSource(settingsArtwork),
  notification: imageSource(notificationArtwork),
  search: imageSource(searchArtwork),
  calendar: imageSource(calendarArtwork),
  goal: imageSource(goalArtwork),
  reflection: imageSource(reflectionArtwork),
  close: imageSource(closeArtwork),
  check: imageSource(checkArtwork),
  refresh: imageSource(refreshArtwork),
  logout: imageSource(logoutArtwork),
  offline: imageSource(offlineArtwork),
  shieldAlert: imageSource(shieldAlertArtwork),
} as const;
