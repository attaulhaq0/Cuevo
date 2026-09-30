# Qatar Private-School Jurisdiction — Deep Implementation Dossier

Status: JURISDICTION REFERENCE. This is not one universal curriculum.

## Qatar is a configuration overlay

The product must separate:

```text
Curriculum / programme
+
Qatar jurisdiction requirements
+
School policy
+
Quality/accreditation framework
```

Qatar's Ministry of Education and Higher Education maintains a diverse private-school sector with multiple educational systems, and its current services cover private-school licensing, student evaluation, schools' evaluation and private education matters.

Official Ministry portal:
https://www.edu.gov.qa/en/

## Local requirements

The jurisdiction layer must support current requirements around applicable local subjects, educational resources, school governance, assessment, inclusion, behavior and other regulatory matters.

The Ministry's 2024 public-policy guideline for private education addresses governance, school plans, student behavior, academic assessment, teacher development, educational resources, inclusion and student rights.

Source:
https://edu.gov.qa/en/News/Details/10638600

## Educational resources

The Ministry has published review guidance for core/support educational resources, including approval controls and alignment with Qatar's religious, national, Arab and social context.

Source:
https://www.edu.gov.qa/en/News/Details/1458600

## National accreditation

The Ministry states that the National School Accreditation System has applied to private and international schools since 2011 and aims to enhance school performance, continuous improvement and educational outcomes.

Source:
https://edu.gov.qa/en/News/Details/10669200

## Important architectural consequence

Do not create:

```text
qatar_curriculum = true
```

Create:

```text
jurisdiction = Qatar
```

with dated requirement sets that can be attached to different school curriculum configurations.

## British Qatar archetype

The intended MVP reference school uses:

```text
England National Curriculum foundation
+
Cambridge IGCSE selected subject
+
Qatar jurisdiction layer
```

Do not claim that this combination automatically satisfies every licensing, regulatory or accreditation requirement.
