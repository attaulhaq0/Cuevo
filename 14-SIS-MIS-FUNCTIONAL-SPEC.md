# SIS / MIS Functional Specification

## Purpose

Provide enough school operating context for the LXP to be standalone.

## MVP entities

- school
- campus
- academic year
- term
- student
- guardian
- teacher/staff
- class
- subject
- enrollment
- attendance
- timetable
- calendar
- basic documents
- announcements
- report period

## Student profile

Separate:
- identity
- enrolment
- academic context
- parent/guardian relationships
- attendance
- learning profile fields
- approved support/accommodation metadata

Do not combine sensitive records into one unrestricted object.

## Parent relationship

A parent relationship must have:
- student
- guardian
- relationship type
- status
- effective_from
- effective_to
- school authorization

Revoked relationships remove future protected access.

## Standalone principle

The school can run core learning operations without a second LMS/SIS.

## Non-MVP

- payroll
- finance
- HR
- transport
- cafeteria
- procurement
- full admissions CRM

Provide integration points later.
