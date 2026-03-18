# Grading Logic

This document describes how grading, total score, average score, and position currently work in this repository.

Primary implementation files:

- `server/utils/result-calculator.ts`
- `server/routes.ts`
- `server/storage.ts`
- `shared/schema.ts`
- `client/src/pages/score-metrics.tsx`

## Overview

The app supports two result entry paths:

1. Direct student result entry
2. Result-sheet entry by class and subject, then aggregation into student results

In both cases, grades are derived from configured grade ranges, and the final student result record stores:

- `subjects`
- `totalScore`
- `averageScore`
- `position`
- `totalStudents`

## Grade Ranges

Grade ranges are stored per school in `schools.gradeRanges`.

If a school has no custom grade ranges, the app falls back to `DEFAULT_GRADE_RANGES` from `shared/schema.ts`:

- `A`: 70-100
- `B`: 60-69
- `C`: 50-59
- `D`: 40-49
- `E`: 30-39
- `F`: 0-29

The grade lookup logic is in `getGradeAndRemark(...)` in `server/utils/result-calculator.ts`.

For each subject total:

1. The code scans the configured ranges in order.
2. The first matching range is used.
3. The grade and remark are attached to the subject record.

## Subject Total Calculation

For direct result entry, `calculateResults(...)` in `server/utils/result-calculator.ts` computes:

`subject total = ca1 + ca2 + exam`

Each subject in the result then gets:

- `total`
- `grade`
- `remark`

This logic assumes the result model is based on three score parts:

- `ca1`
- `ca2`
- `exam`

## Total Score

For a student result:

`totalScore = sum of all subject totals`

This is done in:

- `server/utils/result-calculator.ts` for direct entry
- `server/storage.ts` during result-sheet aggregation and re-aggregation

Example:

- Mathematics total = 72
- English total = 65
- Biology total = 81

Then:

`totalScore = 72 + 65 + 81 = 218`

## Average Score

For a student result:

`averageScore = totalScore / number of subjects`

The code rounds this to 2 decimal places in the core calculator and also in aggregation flows.

Example:

- `totalScore = 218`
- `subjects = 3`

Then:

`averageScore = 218 / 3 = 72.67`

## Result-Sheet Flow

The spreadsheet-style flow works differently from direct student result entry.

### Step 1: Teacher submits a result sheet

A `result_sheet` represents one:

- school
- class
- subject
- session
- term

Each student row is stored in `result_sheet_entries` with:

- `ca1`
- `ca2`
- `exam`
- `total`
- `grade`
- `remark`

### Step 2: School admin approves the sheet

When a sheet is approved, the backend merges that subject into each affected student's `results.subjects` array.

### Step 3: Student results are rebuilt or updated

In `server/storage.ts`, the aggregation logic:

1. reads approved sheet entries
2. groups them by student
3. rebuilds the student's subject list
4. recalculates `totalScore`
5. recalculates `averageScore`

This means the student-level result is effectively an aggregate of approved subject sheets.

## Position Calculation

Position calculation is implemented in `calculateAndUpdatePositions(...)` in `server/storage.ts`.

It runs when:

- a school admin approves a result
- a school admin approves a result sheet and aggregation occurs
- the manual `/api/results/calculate-positions` endpoint is called

### When positions are enabled

The backend checks `schools.computationMode`.

Positions are only calculated when the computation mode is not:

- `total_average_only`

Current modes exposed in the UI:

- `total_average_only`
- `position_average_only`
- `total_average_position`

Important detail:

The backend still stores `totalScore` and `averageScore` in all modes. The mode mainly controls whether positions are recalculated.

### How positions are ranked

The logic groups results by class and then sorts each class by:

1. `totalScore` descending
2. `averageScore` descending

If both values are equal, students share the same position.

Example:

- Student A: total 500, average 83.33
- Student B: total 500, average 83.33
- Student C: total 480, average 80

Positions become:

- A = 1
- B = 1
- C = 3

The code also writes `totalStudents` for each result in that class group.

## What Students See During Result Check

The public result checker returns:

- subject scores
- `totalScore`
- `averageScore`
- `position`
- `totalStudents`
- teacher comment
- principal comment
- attendance

The check-result page always renders total and average when present, and renders position when both `position` and `totalStudents` exist.

## Important Implementation Gaps

These are repo-specific issues found during the scan.

### 1. Class identity is inconsistent in position logic

`results.class` stores a class name, but `calculateAndUpdatePositions(...)` accepts an optional `classId`.

That means filtered position recalculation can behave incorrectly if a caller passes a class ID while the stored result record contains a class name.

Impact:

- position recalculation by class can silently miss records

Recommended fix:

- store both `classId` and `className` on `results`, or
- store only `classId` in results and join for display

### 2. Score metrics are configurable in UI but grading math is hard-coded

The app has `score_metrics`, but the actual grading math still assumes:

- `ca1`
- `ca2`
- `exam`

Impact:

- custom metrics do not truly drive result computation
- labels and limits can drift from stored data

Recommended fix:

- replace fixed `ca1/ca2/exam` fields with a metric-driven array keyed by metric ID

### 3. Public result display is hard-coded to CA1/CA2/Exam

`client/src/pages/check-result.tsx` renders:

- `CA1 (10)`
- `CA2 (10)`
- `Exam (80)`

Impact:

- schools that configure different score metrics still get a fixed display

Recommended fix:

- include the school's active score metrics in the result payload and render columns dynamically

### 4. Computation mode naming is broader than backend enforcement

The UI suggests computation modes control what is shown, but the backend mainly uses the flag to decide whether to calculate positions.

Impact:

- total and average are still calculated and stored regardless of mode

Recommended fix:

- either rename the modes to reflect actual behavior, or
- enforce mode-specific output rules consistently at API and UI layers

## Improvement Summary

If you want the grading system to be reliable long-term, the next changes should be:

1. Normalize results to use `classId` consistently.
2. Move from fixed `ca1/ca2/exam` fields to metric-driven scoring.
3. Return score metric definitions with result payloads.
4. Make computation modes affect both calculation and presentation, not just position recalculation.
