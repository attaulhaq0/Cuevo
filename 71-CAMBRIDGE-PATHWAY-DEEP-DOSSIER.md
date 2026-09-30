# Cambridge Pathway — Deep Implementation Dossier

Status: STRUCTURAL SOURCE-OF-TRUTH. Individual subjects/versions require their own validated pack.

## Cambridge pathway family

Edeviser must not model "Cambridge" as one curriculum switch.

Represent separate programme/qualification contexts:

```text
Cambridge
├── Primary
├── Lower Secondary
├── IGCSE
├── O Level
├── International AS Level
└── International A Level
```

Official programme overview:
https://www.cambridgeinternational.org/programmes-and-qualifications/

## Primary / Lower Secondary

These are curriculum programmes that can be used across stages and subjects. Their references and progression must be modeled separately from IGCSE/O Level qualification behavior.

## IGCSE / O Level

A qualification context may include:

- syllabus identity
- syllabus version
- subject
- component structure
- tier/route where applicable
- assessment mode(s)
- examination series
- result/grade representation
- qualification status

Do not assume one grading, assessment or weighting model across Cambridge subjects.

## AS/A Level

Represent staged assessment where applicable, subject-specific components and qualification-level results. Do not hard-code one universal component tree because subject rules vary.

## Concrete MVP

Use Cambridge IGCSE Mathematics 0580 as the first real qualification validation pack.

Official source:
https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-mathematics-0580/

The official current public page lists syllabus periods including 2025–2027 and 2028–2030 and identifies changes such as a dedicated non-calculator paper at each tier for the 2025–2027 syllabus.

## Rights boundary

Cambridge provides registered schools access to a large School Support Hub resource library, including teaching/learning resources and assessment materials. Edeviser must not reproduce restricted materials without authorization.

## Qatar pathway

For the Qatar British-school archetype, Cambridge is a qualification layer that can sit on top of an England/British curricular foundation. It is not a synonym for the whole British pathway.

## Pack implementation requirements

Every Cambridge programme/subject pack must preserve:

- native terminology
- versioned source
- assessment behavior
- grading representation
- examination/series context where applicable
- external/internal component distinctions where applicable
- historical version identity

## Customer-ready rule

A single validated Cambridge subject does NOT make Edeviser "Cambridge supported." Advertise only the exact verified programme/subject/version denominator.
