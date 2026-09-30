# Qatar Jurisdiction Pack

## Purpose

Represent Qatar-specific school requirements as a jurisdiction/local-policy layer that can sit alongside British, Cambridge, IB, Pakistani and other programmes.

## Official school landscape

Qatar's Ministry private-school search lists schools by educational curriculum and includes British, IB, Pakistani and mixed curriculum types.

Source:
https://privateschoolssearch.edu.gov.qa/en/pages/privateschoolsearch.aspx

## National School Accreditation

The Ministry states that the QNSA system has been applied to private/international schools since 2011 and emphasizes school performance, continuous improvement and educational outcomes.

Source:
https://edu.gov.qa/en/News/Details/10669200

## Local requirements

The school configuration should be able to represent applicable requirements including:
- Qatari national identity/cultural requirements
- Arabic/Islamic education requirements where applicable
- Qatar History requirements where applicable
- school-specific Ministry requirements
- reporting/submission obligations where applicable

Do not assume one rule applies identically to every school.

## Architecture

```text
School
 +
Curriculum Programme
 +
Qatar Jurisdiction Pack
 +
School Policy
 +
Quality Frameworks
```

## British-school MVP

Target:
- England National Curriculum foundation
- Cambridge IGCSE qualification layer
- Qatar local requirements

## Important

Qatar is not a single curriculum for every private school.

The Ministry landscape includes multiple educational systems.

## Current source control

Any official requirement that affects production behavior must be:
- sourced
- versioned
- approved
- mapped to scope
- tested
