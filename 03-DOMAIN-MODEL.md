# Domain Model

## Core identity

- User
- Person
- Student
- Teacher
- Staff
- Parent/Guardian
- Relationship
- Role
- Permission

## Tenant/school

- School
- Campus
- AcademicYear
- Term
- Grade
- Class/Section
- Subject
- Enrollment
- ProgrammeInstance

## Curriculum

- CurriculumFamily
- Framework
- Programme
- Version
- Stage
- AcademicReference
- ReferenceRelationship
- CurriculumAssignment
- CurriculumPack
- PackStatus
- SourceRecord
- RightsRecord
- AcademicReviewer

## Learning

- Course
- Unit
- Lesson
- LearningActivity
- Resource
- Assignment
- Quiz
- Question
- Submission
- Feedback
- LearningProgress

## Assessment

- Assessment
- AssessmentModel
- Rubric
- RubricCriterion
- AssessmentComponent
- Result
- ResultRevision
- GradeRepresentation

## Evidence

- Evidence
- EvidenceLink
- EvidenceSource
- EvidenceReview
- Provenance

## Learner state

- LearnerStateSnapshot
- LearnerAcademicState
- LearnerDevelopmentState
- LearnerEngagementState
- LearnerSupportState
- LearnerImpactState

## Development

- HabitDefinition
- HabitObservation
- HabitPattern
- Reflection
- DevelopmentGoal
- Recognition
- XPTransaction
- Achievement

## Intervention

- Intervention
- InterventionPlan
- InterventionAction
- InterventionExecution
- Reassessment
- OutcomeMeasurement

## Intelligence

- IntelligenceRun
- IntelligenceContextReference
- IntelligenceObservation
- Recommendation
- RecommendationEvidence
- HumanDecision
- AIArtifact

## Signals/automation

- Signal
- SignalRule
- SignalResolution
- Workflow
- WorkflowTrigger
- WorkflowExecution

## Social

- Community
- Group
- Membership
- DiscussionThread
- Post
- Reaction
- DirectConversation
- Message
- ModerationAction
- Report
- Block/Restrict
- SafetyEvent

## Communication

- Announcement
- Notification
- MessageTemplate
- DeliveryAttempt

## Quality

- CQIAction
- CQIObjective
- CQIMeasurement
- QualityFramework
- QualityStandard
- QualityEvidence
- ReviewCycle

## Important invariants

1. Every domain record has `school_id` unless explicitly global.
2. Every protected record has an authorization path.
3. Every academic result points to a specific assessment and policy/version context.
4. Result revisions are immutable.
5. AI artifacts do not overwrite authoritative records.
6. Evidence and inference are distinct.
7. Habit observations do not mutate grades.
8. Quality/accreditation references do not mutate academic records.
9. A child relationship must be current for a parent to gain new access.
10. Curriculum versions are immutable once used in official records.

## IDs

Prefer UUIDv7 or another time-sortable UUID strategy where supported.

Never expose sequential database IDs for sensitive resources.

## Soft delete

Do not use soft-delete as a substitute for audit retention.

Use:
- status/archival state
- immutable audit
- retention policy
- explicit deletion workflows

where necessary.
