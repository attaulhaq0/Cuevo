import foxiReady from './assets/companion-foxi-ready.webp';
import foxiRead from './assets/companion-foxi-read.webp';
import foxiWork from './assets/companion-foxi-work.webp';
import owlReady from './assets/companion-owl-ready.webp';
import owlRead from './assets/companion-owl-read.webp';
import owlWork from './assets/companion-owl-work.webp';
import rabbitReady from './assets/companion-rabbit-ready.webp';
import rabbitRead from './assets/companion-rabbit-read.webp';
import rabbitWork from './assets/companion-rabbit-work.webp';
import turtleReady from './assets/companion-turtle-ready.webp';
import turtleRead from './assets/companion-turtle-read.webp';
import turtleWork from './assets/companion-turtle-work.webp';
import type { CompanionRegistry } from './model';

/** Only the twelve accepted MVP stills, not the entire future library. */
export const companionPoses: CompanionRegistry = {
  foxi: { ready: { src: foxiReady.src, width: foxiReady.width, height: foxiReady.height }, read: { src: foxiRead.src, width: foxiRead.width, height: foxiRead.height }, work: { src: foxiWork.src, width: foxiWork.width, height: foxiWork.height } },
  owl: { ready: { src: owlReady.src, width: owlReady.width, height: owlReady.height }, read: { src: owlRead.src, width: owlRead.width, height: owlRead.height }, work: { src: owlWork.src, width: owlWork.width, height: owlWork.height } },
  rabbit: { ready: { src: rabbitReady.src, width: rabbitReady.width, height: rabbitReady.height }, read: { src: rabbitRead.src, width: rabbitRead.width, height: rabbitRead.height }, work: { src: rabbitWork.src, width: rabbitWork.width, height: rabbitWork.height } },
  turtle: { ready: { src: turtleReady.src, width: turtleReady.width, height: turtleReady.height }, read: { src: turtleRead.src, width: turtleRead.width, height: turtleRead.height }, work: { src: turtleWork.src, width: turtleWork.width, height: turtleWork.height } },
};
