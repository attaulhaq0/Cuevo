import foxi from './assets/foxi-seated.webp';
import foxiTaskEdge from './assets/foxi-task-edge.webp';
import foxiCelebrate from './assets/foxi-celebrate.webp';
import owl from './assets/owl-guide.webp';
import rabbit from './assets/rabbit-planner.webp';
import turtle from './assets/turtle-practice.webp';
import background from './assets/trail-background.png';
import lesson from './assets/lesson.webp';
import work from './assets/work.webp';
import workSubject from './assets/work-subject.webp';
import pedestal from './assets/pedestal.svg';
import feedback from './assets/feedback.webp';
import practice from './assets/practice.webp';
import reflect from './assets/reflect.webp';
import portfolio from './assets/portfolio.webp';
import grow from './assets/grow.webp';
import milestone from './assets/milestone.webp';
import path from './assets/trail-path.svg';
import goal from './assets/goal.webp';
import community from './assets/class-discussion.webp';
import help from './assets/human-help.webp';

/** Public decorative artwork only. Selection never supplies domain authority. */
export const trailAssets = {
  foxi: foxiTaskEdge.src, background: background.src, lesson: lesson.src, work: work.src,
  feedback: feedback.src, practice: practice.src, reflect: reflect.src,
  portfolio: portfolio.src, grow: grow.src, milestone: milestone.src, owl: owl.src,
  path: typeof path === 'string' ? path : path.src,
  goal: goal.src, community: community.src, help: help.src,
  workSubject: workSubject.src,
  pedestal: typeof pedestal === 'string' ? pedestal : pedestal.src,
} as const;

export const companionAssets = {
  foxi: { image: foxi.src, width: foxi.width, height: foxi.height, confirmation: foxiCelebrate.src },
  owl: { image: owl.src, width: owl.width, height: owl.height },
  rabbit: { image: rabbit.src, width: rabbit.width, height: rabbit.height },
  turtle: { image: turtle.src, width: turtle.width, height: turtle.height },
} as const;

export type CompanionAssetName = keyof typeof companionAssets;
