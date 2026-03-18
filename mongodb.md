# MongoDB Migration Guide

This repository currently uses PostgreSQL through Drizzle ORM and Neon. The database contract is concentrated in:

- `server/db.ts`
- `shared/schema.ts`
- `server/storage.ts`
- `drizzle.config.ts`
- `server/seed.ts`

The React client and most Express route handlers can remain largely unchanged if the storage interface stays stable. The safest migration path is to replace the current Postgres-backed `DatabaseStorage` implementation with a MongoDB-backed implementation while preserving the `IStorage` API.

## Current Database Shape

The app is multi-tenant and almost every business record is scoped by `schoolId`.

Current relational tables:

- `users`
- `schools`
- `students`
- `results`
- `pins`
- `pin_requests`
- `classes`
- `subjects`
- `teacher_assignments`
- `score_metrics`
- `class_subjects`
- `notifications`
- `audit_logs`
- `result_sheets`
- `result_sheet_entries`
- `archived_result_sheets`
- `archived_result_sheet_entries`
- `archived_results`

Important current Postgres-specific choices:

- `shared/schema.ts` uses `pgTable`, `uuid`, `jsonb`, `decimal`, and `sql\`gen_random_uuid()\``.
- `server/db.ts` uses `@neondatabase/serverless` and `drizzle-orm/neon-serverless`.
- `server/storage.ts` relies heavily on Drizzle query builders and `.returning()`.
- `drizzle.config.ts` is hard-coded to `dialect: "postgresql"`.

## Recommended Migration Strategy

Use the native MongoDB driver or Mongoose on the server, and keep the route layer unchanged.

Recommended order:

1. Introduce a MongoDB connection module.
2. Add MongoDB model/schema definitions.
3. Build a new `MongoStorage` class that implements `IStorage`.
4. Swap `storage` export from Postgres to MongoDB.
5. Write a one-off migration script from Postgres rows to MongoDB documents.
6. Remove Drizzle/Neon/Postgres packages only after the app is stable.

This is lower-risk than trying to force the existing Drizzle Postgres schema into a Mongo-first design.

## Package Changes

Remove eventually:

- `@neondatabase/serverless`
- `drizzle-orm`
- `drizzle-kit`
- `connect-pg-simple`
- `@types/connect-pg-simple`

Add:

- `mongodb`

Optional alternative:

- `mongoose`

If you want the thinnest runtime layer, use `mongodb`. If you want schema middleware, validation hooks, and model ergonomics, use `mongoose`.

## Environment Changes

Replace:

- `DATABASE_URL`

With:

- `MONGODB_URI`
- `MONGODB_DB_NAME` if you want DB name separate from URI

Update all startup checks in:

- `server/db.ts`
- `drizzle.config.ts` if retained temporarily

## File-by-File Migration Plan

## 1. `server/db.ts`

Current role:

- Opens a Neon/Postgres pool.
- Instantiates Drizzle with the Postgres schema.

Replace it with a MongoDB connection singleton. Example shape:

```ts
import "dotenv/config";
import { MongoClient, Db } from "mongodb";

if (!process.env.MONGODB_URI) {
  throw new Error("MONGODB_URI must be set");
}

const client = new MongoClient(process.env.MONGODB_URI);
let db: Db;

export async function connectToMongo() {
  if (!db) {
    await client.connect();
    db = client.db(process.env.MONGODB_DB_NAME || "completeschoolresult");
  }
  return db;
}

export { client };
```

Then make storage methods obtain collections from this DB.

## 2. `shared/schema.ts`

This file is fully Postgres/Drizzle-specific today. It contains both:

- database schema definitions
- Zod request validation

For MongoDB, split responsibilities:

- Move request validation schemas into a neutral file like `shared/validation.ts`
- Move persistence schemas/types into a server-only file like `server/models/*`

Keep and reuse:

- Zod insert/request schemas
- exported TypeScript domain types, if you want
- grade configuration types like `GradeRange`

Replace:

- `pgTable(...)`
- `uuid(...)`
- `jsonb(...)`
- `decimal(...)`
- Drizzle `relations(...)`

With:

- plain TypeScript interfaces, or
- Mongoose schemas, or
- Mongo collection helper modules

## 3. `server/storage.ts`

This is the main migration surface.

Today it assumes relational queries and Drizzle semantics such as:

- `db.select().from(...).where(...)`
- `db.insert(...).values(...).returning()`
- `db.update(...).set(...).where(...).returning()`
- `db.delete(...)`
- `and(...)`, `eq(...)`, `desc(...)`, `inArray(...)`
- SQL count queries

Replace with Mongo collection operations such as:

- `findOne`
- `find`
- `insertOne`
- `insertMany`
- `findOneAndUpdate`
- `deleteOne`
- `deleteMany`
- `countDocuments`
- aggregation pipelines where needed

Strong recommendation:

- keep `IStorage`
- create `MongoStorage implements IStorage`
- switch `export const storage = new MongoStorage()`

That isolates the migration to one backend layer.

## 4. `server/seed.ts`

Keep the business logic, but swap Drizzle-backed calls for Mongo-backed calls through `storage`.

If `storage` remains the common interface, this file may need little or no change.

## 5. `drizzle.config.ts`

This becomes obsolete once Drizzle is removed.

Delete it after migration, along with the `db:push` script in `package.json`.

## Data Modeling Recommendations

Use one collection per current table first. Do not over-embed on day one.

Suggested collections:

- `users`
- `schools`
- `students`
- `results`
- `pins`
- `pinRequests`
- `classes`
- `subjects`
- `teacherAssignments`
- `scoreMetrics`
- `classSubjects`
- `notifications`
- `auditLogs`
- `resultSheets`
- `resultSheetEntries`
- `archivedResultSheets`
- `archivedResultSheetEntries`
- `archivedResults`

This mirrors the current code and reduces migration risk.

### Document ID Strategy

Use string UUIDs for `id` instead of Mongo `ObjectId` as the public identifier.

Reason:

- the route layer already expects string IDs
- `schoolId`, `studentId`, `classId`, `subjectId`, etc. are all stored as strings
- preserving IDs makes PostgreSQL-to-Mongo data migration simpler

Recommended pattern:

- keep Mongo `_id` as ObjectId internally if you want, but also store `id: string`, or
- use `id` as the canonical key and create a unique index on it

For this repo, using `id: string` everywhere is the least disruptive option.

## Collection Mapping Notes

### Collections that already behave document-like

These already contain JSON-style nested data and map naturally to MongoDB:

- `schools.gradeRanges`
- `results.subjects`
- `results.attendance`
- `pins.usedBy`
- `pins.attempts`
- `pinRequests.generatedPinIds`
- `notifications.data`
- `auditLogs.details`

These can move almost directly.

### Collections that may be worth embedding later

Possible later optimizations, not required for the first migration:

- embed `resultSheetEntries` inside `resultSheets`
- embed `classSubjects` into `classes`
- embed `teacherAssignments` into `users` or `classes`

Do not do this in the first pass unless you are also willing to rewrite the storage logic and reporting queries.

## Required MongoDB Indexes

Recreate the important Postgres indexes as MongoDB indexes.

Minimum set:

- `users`: unique `{ email: 1 }`
- `schools`: unique `{ code: 1 }`
- `schools`: unique `{ subdomain: 1 }`
- `students`: unique `{ schoolId: 1, admissionNumber: 1 }`
- `results`: unique `{ schoolId: 1, studentId: 1, session: 1, term: 1 }`
- `results`: `{ schoolId: 1, session: 1, term: 1, status: 1 }`
- `pins`: unique `{ pin: 1 }`
- `pins`: `{ schoolId: 1, session: 1, term: 1 }`
- `pinRequests`: `{ schoolId: 1, status: 1 }`
- `classes`: `{ schoolId: 1, name: 1, academicYear: 1 }`
- `subjects`: `{ schoolId: 1, code: 1 }`
- `scoreMetrics`: `{ schoolId: 1, order: 1 }`
- `notifications`: `{ userId: 1, isRead: 1 }`
- `notifications`: `{ userId: 1, createdAt: -1 }`
- `auditLogs`: `{ userId: 1 }`
- `auditLogs`: `{ resource: 1, resourceId: 1 }`
- `auditLogs`: `{ createdAt: -1 }`
- `resultSheets`: `{ schoolId: 1, classId: 1, subjectId: 1, session: 1, term: 1 }`
- `resultSheets`: `{ schoolId: 1, status: 1 }`
- `resultSheetEntries`: `{ sheetId: 1, studentId: 1 }`

## Type Conversion Rules

### UUIDs

Current state:

- almost every primary key is a Postgres UUID string

Mongo plan:

- preserve them as strings

### Decimals

Current state:

- `totalScore`, `averageScore`, `ca1`, `ca2`, `exam`, `total` are stored as Postgres decimals and often handled as strings in TypeScript

Mongo options:

1. Store them as numbers
2. Store them as `Decimal128`

Recommendation for this repo:

- store them as numbers unless you have strict financial-grade precision requirements

Reason:

- the app already parses these into numbers repeatedly in `server/storage.ts`
- result scores are academic scores, not money
- using numbers simplifies aggregation and reduces conversion noise

If you choose numbers, update any types that still assume string decimals.

### Timestamps

Current state:

- Drizzle timestamps become JS `Date`

Mongo plan:

- store all timestamps as `Date`

### JSONB

Current state:

- several fields already hold arbitrary JSON-like objects

Mongo plan:

- store them as embedded subdocuments or arrays directly

## Query Rewrite Notes

These parts of `server/storage.ts` need special attention.

### `.returning()`

Mongo does not have a direct equivalent for every operation. Use:

- `insertOne` then fetch by inserted ID or reused `id`
- `findOneAndUpdate` with return-document-after semantics

### Counts

Replace SQL count expressions with:

- `countDocuments(filter)`

This affects dashboard stats heavily.

### Sorting

Replace `orderBy(desc(createdAt))` with:

- `.find(filter).sort({ createdAt: -1 })`

### `inArray(...)`

Replace with:

- `{ field: { $in: ids } }`

### Transactions

There are archive/delete flows in `server/storage.ts` that are logically multi-step and should be atomic:

- `archiveResultSheets`
- `archiveResults`

If you need strict atomicity, use MongoDB replica-set transactions. If you deploy to MongoDB Atlas, this is available. If not, you must accept partial-failure handling or redesign the flow.

## Areas Likely To Break During Migration

### 1. Shared schema imports

`server/routes.ts` imports Zod schemas from `@shared/schema`. If you remove Drizzle definitions from that file, preserve the Zod exports or move imports carefully.

### 2. Result score types

Some methods in `server/storage.ts` call `parseFloat` on decimal-like fields because Postgres returns them as strings. If Mongo stores numbers, these conversions should be simplified or normalized.

### 3. Position calculation

`calculateAndUpdatePositions(...)` sorts and updates results by class/session/term. Ensure the stored `class` value remains consistent. There is already a code smell here: the method accepts `classId?: string` but compares it to `results.class`, which appears to hold a class name, not a class ID.

That issue exists before the Mongo migration and should be cleaned up during the rewrite.

### 4. Archival model duplication

Archive collections mirror live collections. MongoDB handles document copying easily, but the logic is still multi-step and needs careful error handling or transactions.

## Suggested New Structure

A clean Mongo-oriented server layout would be:

```text
server/
  db/
    mongo.ts
    indexes.ts
  models/
    users.ts
    schools.ts
    students.ts
    results.ts
    ...
  storage/
    interface.ts
    mongo-storage.ts
```

If you want a smaller diff, keep `server/storage.ts` and replace the implementation in place.

## PostgreSQL to MongoDB Data Migration Script

Write a one-time script that:

1. Connects to PostgreSQL using the old `DATABASE_URL`
2. Reads each table in dependency-safe order
3. Converts decimals to numbers
4. Preserves all existing `id` values
5. Bulk inserts into MongoDB collections
6. Creates indexes
7. Verifies counts per collection

Suggested extraction order:

1. `schools`
2. `users`
3. `classes`
4. `subjects`
5. `students`
6. `score_metrics`
7. `class_subjects`
8. `teacher_assignments`
9. `results`
10. `pins`
11. `pin_requests`
12. `notifications`
13. `audit_logs`
14. `result_sheets`
15. `result_sheet_entries`
16. `archived_results`
17. `archived_result_sheets`
18. `archived_result_sheet_entries`

Verification checklist:

- document counts match row counts
- unique constraints are preserved
- login works
- school lookup by subdomain works
- student lookup by `{ schoolId, admissionNumber }` works
- result approval/publishing flows still work
- archive flows still work
- dashboard counts still match expected totals

## Minimal First Pass

If the goal is to get the repo working on MongoDB quickly, do this:

1. Preserve `IStorage`.
2. Keep one collection per current table.
3. Preserve string UUID-style IDs.
4. Store score decimals as numbers.
5. Keep route handlers unchanged.
6. Move Zod schemas out of Drizzle-specific code.
7. Rebuild only the persistence layer and seed script.

That gets you to MongoDB with the least application churn.

## Concrete Task List For This Repo

1. Create Mongo connection module and env handling.
2. Move Zod validators out of `shared/schema.ts`.
3. Replace Drizzle schema definitions with Mongo-friendly types or models.
4. Rewrite `server/storage.ts` against MongoDB collections.
5. Add collection indexes at startup or in a separate setup script.
6. Update `server/seed.ts` if needed.
7. Remove `drizzle.config.ts` and `db:push`.
8. Remove Neon/Postgres dependencies from `package.json`.
9. Add a one-off migration script for existing Postgres data.
10. Run regression testing on auth, students, results, PINs, result sheets, archive flows, and dashboard analytics.

## Recommendation

Do not attempt a partial hybrid where the same storage layer talks to both Drizzle/Postgres and MongoDB in production code for long. Build a clean Mongo-backed storage implementation, migrate the data, switch over, and then remove the Postgres-specific code.
