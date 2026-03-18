# Result Checker and PIN Logic

This document describes how result checking and PIN usage currently work in this repository.

Primary implementation files:

- `server/routes.ts`
- `server/storage.ts`
- `shared/schema.ts`
- `server/utils/result-calculator.ts`
- `client/src/pages/check-result.tsx`
- `client/src/pages/pins.tsx`
- `client/src/pages/pin-requests.tsx`

## Overview

The result checker is school-scoped.

A school:

1. signs up or is created
2. adds users, classes, subjects, students, and results
3. generates PINs directly or requests PINs
4. gives a PIN to a student
5. the student checks a result with:
   - PIN
   - admission number
   - session
   - term

## What a PIN Is Tied To

A PIN record currently belongs to:

- `schoolId`
- `session`
- `term`

It is not tied to:

- a specific `studentId`
- a specific `userId`

That means a PIN is currently a school/session/term access token, not a student-specific access token.

## PIN Fields and Meaning

From `shared/schema.ts`, the relevant fields are:

- `pin`
- `schoolId`
- `session`
- `term`
- `isUsed`
- `usedBy`
- `attempts`
- `maxAttempts`
- `maxUsageCount`
- `usageCount`
- `expiryDate`
- `generatedBy`

### Current meaning of the main fields

- `maxUsageCount`: how many successful result checks the PIN is allowed to make
- `usageCount`: how many successful checks have already happened
- `isUsed`: whether the PIN is exhausted
- `attempts`: audit trail of successful and failed checks
- `usedBy`: currently only the latest successful usage snapshot

## How PINs Are Created

There are two paths.

### 1. Direct generation

Endpoint:

- `POST /api/pins`

Used by:

- super admin
- school admin

Inputs include:

- `schoolId` for super admin
- `quantity`
- `session`
- `term`
- `maxUsageCount`
- `expiryDate`

Current behavior after the fix:

- respects the provided expiry date when sent from the UI
- defaults to 6 months if no expiry date is provided
- clamps `maxUsageCount` to a safe range

### 2. PIN request approval

Endpoints:

- `POST /api/pin-requests`
- `POST /api/pin-requests/:id/approve`
- `POST /api/pin-requests/:id/reject`

Flow:

1. school admin requests a quantity of PINs
2. super admin approves or rejects
3. approval generates PINs for the request's school/session/term

Current approval flow still defaults expiry to 6 months.

## How Result Checking Works

Endpoint:

- `POST /api/public/check-result`

The request body contains:

- `pin`
- `admissionNumber`
- `session`
- `term`

### Validation steps

The backend currently does the following in order:

1. confirms PIN and admission number are present
2. confirms session and term are present
3. looks up the PIN by value
4. checks that the PIN's session and term match the request
5. checks that the PIN is not expired
6. checks that `usageCount < maxUsageCount`
7. checks that failed attempts have not exceeded `maxAttempts`
8. looks up the student by `admissionNumber` inside the PIN's `schoolId`
9. looks up the student's result for the same session and term
10. only allows access if result status is `approved` or `published`

### On failed student lookup

The system appends a failed attempt into `attempts`.

### On success

The system:

1. increments `usageCount`
2. appends a success entry into `attempts`
3. updates `usedBy` with the latest successful student snapshot
4. sets `isUsed = true` once the PIN reaches `maxUsageCount`
5. returns the result payload

## How Many Times a PIN Can Be Used

The allowed number of successful uses is controlled by:

- `maxUsageCount`

The actual number of successful uses already consumed is:

- `usageCount`

Examples:

- `maxUsageCount = 1`, `usageCount = 0` -> one check remaining
- `maxUsageCount = 1`, `usageCount = 1` -> exhausted
- `maxUsageCount = 3`, `usageCount = 2` -> one successful check remaining

The UI in `client/src/pages/pins.tsx` now matches this behavior because it already treats a PIN as exhausted when:

- `usageCount >= maxUsageCount`

## Is the PIN Tied to a User ID?

No.

Current answer:

- not tied to app `user.id`
- not tied to `student.id` at generation time
- only tied to school, session, and term

The public check flow identifies the student at use time by:

- `admissionNumber`

So the PIN is effectively reusable by any student in the same school and same session/term until it is exhausted, as long as the caller knows a valid admission number.

## Current PIN Functionalities

The PIN system currently supports:

- manual PIN generation
- PIN request workflow
- single-use or multi-use PINs through `maxUsageCount`
- expiry dates
- success and failure attempt logging
- latest successful use snapshot in `usedBy`
- school/session/term scoping
- public result access for approved or published results only

## Important Issues Found During Scan

These are the main repo-specific design and logic issues around result checking.

### 1. PINs are not student-specific

This is the issue you already noticed, and it is real.

Impact:

- a PIN can be used for any student in the same school/session/term
- PIN sharing is easy
- there is no one-to-one relationship between PIN and student

Recommended fix:

- add `studentId` to the PIN model for student-assigned PINs, or
- create a `pin_assignments` table linking PINs to students

Then enforce:

- the admission number used in `/api/public/check-result` must match the assigned student

### 2. `usedBy` only stores the latest usage

The schema stores `usedBy` as a single object, not a usage history.

Impact:

- previous successful uses are overwritten
- auditability is weak for multi-use PINs

Recommended fix:

- keep `usageCount` for quick reads
- add a `pin_usages` table or store a `successfulUsages` array with:
  - studentId
  - admissionNumber
  - checkedAt
  - ipAddress
  - userAgent

### 3. Failed-attempt lock and usage limit are separate concepts

The code now treats them separately, which is correct, but the model is still not very explicit.

Current meaning:

- `maxUsageCount` limits successful checks
- `maxAttempts` limits failed attempts

Recommended fix:

- rename `maxAttempts` in UI and docs to `maxFailedAttempts`

### 4. PIN request approval does not support custom expiry

The super-admin approval flow still generates PINs with a fixed 6-month expiry.

Impact:

- direct generation and request-based generation behave differently

Recommended fix:

- add expiry selection to the PIN request approval dialog and pass it into the approval endpoint

### 5. Result checker is admission-number based only

Current public lookup uses:

- `schoolId` from the PIN
- `admissionNumber`

Impact:

- if admission numbers are exposed or guessable, PIN sharing becomes more dangerous

Recommended fix:

- require a second student verifier such as date of birth, surname, or a per-student token

### 6. `usedBy` is not linked to application identities

Even when a successful use is recorded, the system stores:

- admission number
- student name
- timestamp

It does not store:

- `studentId` in `usedBy`
- authenticated `userId` because public checking is unauthenticated

Recommended fix:

- at minimum add `studentId` into the usage snapshot

## Recommended Improved PIN Model

For a stronger result-checker design, split the current model into:

1. `pins`
2. `pinAssignments`
3. `pinUsageLogs`

### `pins`

Store:

- id
- pin
- schoolId
- session
- term
- maxUsageCount
- usageCount
- expiryDate
- status
- generatedBy

### `pinAssignments`

Store:

- pinId
- studentId
- assignedBy
- assignedAt

### `pinUsageLogs`

Store:

- pinId
- studentId
- admissionNumber
- success
- reason
- ipAddress
- userAgent
- createdAt

This would let you support both:

- generic school PIN batches
- student-bound PINs

## Improvement Summary

The next changes that would improve this result checker most are:

1. Make PINs student-specific.
2. Keep a real usage log instead of overwriting `usedBy`.
3. Add custom expiry to the PIN request approval flow.
4. Require a second verifier in the public result-check form.
5. Rename or redesign failed-attempt settings so they are clearer to admins.
