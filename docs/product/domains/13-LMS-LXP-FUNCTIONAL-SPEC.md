# LMS / LXP Functional Specification

## Student

Student home prioritizes:
- next action
- today
- current courses
- progress
- support
- development
- community

## Teacher

Teacher workspace prioritizes:
- classes
- planning
- assessment
- pending feedback
- evidence
- learner signals
- intervention

## Core hierarchy

Course → Unit → Lesson → Activity

Activities may be:
- reading
- video
- file
- discussion
- practice
- quiz
- assignment
- reflection
- external tool

## Assignment

Fields:
- title
- instructions
- due_at
- availability
- submission_type
- curriculum_references
- assessment_id
- resources
- accommodations
- status

## Student submission

State:
DRAFT → SUBMITTED → RETURNED → RESUBMITTED → CLOSED

All meaningful transitions are audited.

## Progress

Progress is not a single completion percentage only.

Track:
- activity completion
- assessed progress
- outcome progress
- learner-selected goals

## LXP home

Do not overload with cards.

Primary hierarchy:
1. next action
2. current learning
3. feedback
4. progress
5. development
6. community

## Mobile

Student learning must support:
- one-handed scrolling
- readable content
- bottom/compact navigation where appropriate
- offline draft for low-risk text where explicitly implemented
- robust resume after reconnect

Do not cache protected content offline by default.
