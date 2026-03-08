import { 
  users, 
  schools, 
  students, 
  results, 
  pins, 
  pinRequests,
  classes,
  subjects,
  teacherAssignments,
  auditLogs,
  scoreMetrics,
  classSubjects,
  notifications,
  resultSheets,
  resultSheetEntries,
  archivedResultSheets,
  archivedResultSheetEntries,
  archivedResults,
  type User, 
  type InsertUser,
  type School,
  type InsertSchool,
  type Student,
  type InsertStudent,
  type Result,
  type InsertResult,
  type PIN,
  type InsertPIN,
  type PINRequest,
  type CreatePINRequest,
  type Class,
  type InsertClass,
  type Subject,
  type InsertSubject,
  type InsertAuditLog,
  type ScoreMetric,
  type InsertScoreMetric,
  type ClassSubject,
  type InsertClassSubject,
  type Notification,
  type InsertNotification,
  type TeacherAssignment,
  type InsertTeacherAssignment,
  type ResultSheet,
  type InsertResultSheet,
  type ResultSheetEntry,
  type InsertResultSheetEntry,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User>;
  listUsers(schoolId?: string): Promise<User[]>;
  deleteUser(id: string): Promise<void>;

  // Schools
  getSchool(id: string): Promise<School | undefined>;
  getSchoolByCode(code: string): Promise<School | undefined>;
  getSchoolBySubdomain(subdomain: string): Promise<School | undefined>;
  createSchool(school: InsertSchool): Promise<School>;
  updateSchool(id: string, data: Partial<InsertSchool>): Promise<School>;
  listSchools(): Promise<School[]>;
  deleteSchool(id: string): Promise<void>;

  // Students
  getStudent(id: string): Promise<Student | undefined>;
  getStudentByAdmissionNumber(admissionNumber: string, schoolId: string): Promise<Student | undefined>;
  createStudent(student: InsertStudent): Promise<Student>;
  createStudents(students: InsertStudent[]): Promise<Student[]>;
  updateStudent(id: string, data: Partial<InsertStudent>): Promise<Student>;
  listStudents(schoolId: string): Promise<Student[]>;
  deleteStudent(id: string): Promise<void>;

  // Results
  getResult(id: string): Promise<Result | undefined>;
  getResultByStudentSessionTerm(studentId: string, session: string, term: string): Promise<Result | undefined>;
  createResult(result: InsertResult): Promise<Result>;
  createResults(results: InsertResult[]): Promise<Result[]>;
  updateResult(id: string, data: Partial<InsertResult>): Promise<Result>;
  listResults(schoolId: string, filters?: { status?: string; session?: string; term?: string }): Promise<Result[]>;
  deleteResult(id: string): Promise<void>;

  // PINs
  getPin(pin: string): Promise<PIN | undefined>;
  getPinById(id: string): Promise<PIN | undefined>;
  createPins(pins: InsertPIN[]): Promise<PIN[]>;
  listPins(schoolId: string): Promise<PIN[]>;
  updatePin(id: string, data: Partial<InsertPIN>): Promise<PIN>;
  deletePin(id: string): Promise<void>;

  // PIN Requests
  getPinRequest(id: string): Promise<PINRequest | undefined>;
  createPinRequest(request: CreatePINRequest): Promise<PINRequest>;
  listPinRequests(schoolId?: string): Promise<PINRequest[]>;
  updatePinRequest(id: string, data: Partial<any>): Promise<PINRequest>;

  // Classes
  getClass(id: string): Promise<Class | undefined>;
  createClass(classData: InsertClass): Promise<Class>;
  updateClass(id: string, data: Partial<InsertClass>): Promise<Class>;
  listClasses(schoolId: string): Promise<Class[]>;
  deleteClass(id: string, schoolId?: string): Promise<void>;

  // Subjects
  getSubject(id: string): Promise<Subject | undefined>;
  createSubject(subject: InsertSubject): Promise<Subject>;
  updateSubject(id: string, data: Partial<InsertSubject>): Promise<Subject>;
  listSubjects(schoolId: string): Promise<Subject[]>;
  deleteSubject(id: string, schoolId?: string): Promise<void>;

  // Audit Logs
  createAuditLog(log: InsertAuditLog): Promise<void>;

  // Score Metrics
  getScoreMetric(id: string): Promise<ScoreMetric | undefined>;
  createScoreMetric(metric: InsertScoreMetric): Promise<ScoreMetric>;
  updateScoreMetric(id: string, data: Partial<InsertScoreMetric>): Promise<ScoreMetric>;
  listScoreMetrics(schoolId: string): Promise<ScoreMetric[]>;
  deleteScoreMetric(id: string): Promise<void>;

  // Class Subjects
  getClassSubjects(classId: string): Promise<ClassSubject[]>;
  setClassSubjects(schoolId: string, classId: string, subjectIds: string[]): Promise<ClassSubject[]>;
  deleteClassSubjects(classId: string): Promise<void>;

  // Notifications
  getNotification(id: string): Promise<Notification | undefined>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  listNotifications(userId: string, limit?: number): Promise<Notification[]>;
  markNotificationRead(id: string): Promise<Notification>;
  markAllNotificationsRead(userId: string): Promise<void>;
  countUnreadNotifications(userId: string): Promise<number>;

  // Teacher Assignments (enhanced)
  getTeacherAssignments(teacherId: string): Promise<TeacherAssignment[]>;
  createTeacherAssignment(assignment: InsertTeacherAssignment): Promise<TeacherAssignment>;
  deleteTeacherAssignment(id: string): Promise<void>;
  setTeacherAssignments(schoolId: string, teacherId: string, assignments: { classId: string; subjectId: string }[]): Promise<TeacherAssignment[]>;

  // Analytics
  getDashboardStats(userId: string, role: string, schoolId?: string): Promise<any>;

  // Result Sheets
  getResultSheet(id: string): Promise<ResultSheet | undefined>;
  createResultSheet(sheet: InsertResultSheet): Promise<ResultSheet>;
  updateResultSheet(id: string, data: Partial<InsertResultSheet>): Promise<ResultSheet>;
  listResultSheets(schoolId: string, filters?: { status?: string; classId?: string; subjectId?: string; session?: string; term?: string }): Promise<ResultSheet[]>;
  deleteResultSheet(id: string): Promise<void>;
  submitResultSheet(id: string, submittedBy: string): Promise<ResultSheet>;
  approveResultSheet(id: string, approvedBy: string): Promise<ResultSheet>;
  rejectResultSheet(id: string, approvedBy: string, reason: string): Promise<ResultSheet>;

  // Result Sheet Entries
  getResultSheetEntry(id: string): Promise<ResultSheetEntry | undefined>;
  createResultSheetEntry(entry: InsertResultSheetEntry): Promise<ResultSheetEntry>;
  createResultSheetEntries(entries: InsertResultSheetEntry[]): Promise<ResultSheetEntry[]>;
  updateResultSheetEntry(id: string, data: Partial<InsertResultSheetEntry>): Promise<ResultSheetEntry>;
  listResultSheetEntries(sheetId: string): Promise<ResultSheetEntry[]>;
  deleteResultSheetEntry(id: string): Promise<void>;
  deleteResultSheetEntriesBySheet(sheetId: string): Promise<void>;

  // Aggregation
  aggregateStudentResults(schoolId: string, session: string, term: string): Promise<void>;
  mergeSheetIntoStudentResults(sheetId: string): Promise<void>;
  reaggregateResults(schoolId: string, session: string, term: string): Promise<number>;

  // Delete & Archive Operations - schoolId required for multi-tenant isolation
  deleteResultSheets(ids: string[], schoolId: string): Promise<void>;
  archiveResultSheets(ids: string[], schoolId: string, archivedBy: string): Promise<void>;
  deleteResults(ids: string[], schoolId: string): Promise<void>;
  archiveResults(ids: string[], schoolId: string, archivedBy: string): Promise<void>;

  // Position Calculation
  calculateAndUpdatePositions(schoolId: string, session: string, term: string, classId?: string): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User> {
    const [user] = await db.update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async listUsers(schoolId?: string): Promise<User[]> {
    if (schoolId) {
      return await db.select().from(users).where(eq(users.schoolId, schoolId));
    }
    return await db.select().from(users);
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  // Schools
  async getSchool(id: string): Promise<School | undefined> {
    const [school] = await db.select().from(schools).where(eq(schools.id, id));
    return school || undefined;
  }

  async getSchoolByCode(code: string): Promise<School | undefined> {
    const [school] = await db.select().from(schools).where(eq(schools.code, code));
    return school || undefined;
  }

  async getSchoolBySubdomain(subdomain: string): Promise<School | undefined> {
    const [school] = await db.select().from(schools).where(eq(schools.subdomain, subdomain));
    return school || undefined;
  }

  async createSchool(insertSchool: InsertSchool): Promise<School> {
    const [school] = await db.insert(schools).values(insertSchool).returning();
    return school;
  }

  async updateSchool(id: string, data: Partial<InsertSchool>): Promise<School> {
    const [school] = await db.update(schools)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schools.id, id))
      .returning();
    return school;
  }

  async listSchools(): Promise<School[]> {
    return await db.select().from(schools).orderBy(desc(schools.createdAt));
  }

  async deleteSchool(id: string): Promise<void> {
    await db.delete(schools).where(eq(schools.id, id));
  }

  // Students
  async getStudent(id: string): Promise<Student | undefined> {
    const [student] = await db.select().from(students).where(eq(students.id, id));
    return student || undefined;
  }

  async getStudentByAdmissionNumber(admissionNumber: string, schoolId: string): Promise<Student | undefined> {
    const [student] = await db.select().from(students)
      .where(and(eq(students.admissionNumber, admissionNumber), eq(students.schoolId, schoolId)));
    return student || undefined;
  }

  async createStudent(insertStudent: InsertStudent): Promise<Student> {
    const [student] = await db.insert(students).values(insertStudent).returning();
    return student;
  }

  async createStudents(insertStudents: InsertStudent[]): Promise<Student[]> {
    if (insertStudents.length === 0) return [];
    return await db.insert(students).values(insertStudents).returning();
  }

  async updateStudent(id: string, data: Partial<InsertStudent>): Promise<Student> {
    const [student] = await db.update(students)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(students.id, id))
      .returning();
    return student;
  }

  async listStudents(schoolId: string): Promise<Student[]> {
    return await db.select().from(students)
      .where(eq(students.schoolId, schoolId))
      .orderBy(desc(students.createdAt));
  }

  async deleteStudent(id: string): Promise<void> {
    await db.delete(students).where(eq(students.id, id));
  }

  // Results
  async getResult(id: string): Promise<Result | undefined> {
    const [result] = await db.select().from(results).where(eq(results.id, id));
    return result || undefined;
  }

  async getResultByStudentSessionTerm(studentId: string, session: string, term: string): Promise<Result | undefined> {
    const [result] = await db.select().from(results)
      .where(and(
        eq(results.studentId, studentId),
        eq(results.session, session),
        eq(results.term, term)
      ));
    return result || undefined;
  }

  async createResult(insertResult: InsertResult): Promise<Result> {
    const [result] = await db.insert(results).values(insertResult).returning();
    return result;
  }

  async createResults(insertResults: InsertResult[]): Promise<Result[]> {
    if (insertResults.length === 0) return [];
    return await db.insert(results).values(insertResults).returning();
  }

  async updateResult(id: string, data: Partial<InsertResult>): Promise<Result> {
    const [result] = await db.update(results)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(results.id, id))
      .returning();
    return result;
  }

  async listResults(schoolId: string, filters?: { status?: string; session?: string; term?: string }): Promise<Result[]> {
    const conditions = [eq(results.schoolId, schoolId)];
    
    if (filters?.status) {
      conditions.push(eq(results.status, filters.status));
    }
    if (filters?.session) {
      conditions.push(eq(results.session, filters.session));
    }
    if (filters?.term) {
      conditions.push(eq(results.term, filters.term));
    }
    
    return await db.select().from(results)
      .where(and(...conditions))
      .orderBy(desc(results.createdAt));
  }

  async deleteResult(id: string): Promise<void> {
    await db.delete(results).where(eq(results.id, id));
  }

  // PINs
  async getPin(pin: string): Promise<PIN | undefined> {
    const [pinRecord] = await db.select().from(pins).where(eq(pins.pin, pin));
    return pinRecord || undefined;
  }

  async getPinById(id: string): Promise<PIN | undefined> {
    const [pin] = await db.select().from(pins).where(eq(pins.id, id));
    return pin || undefined;
  }

  async createPins(insertPins: InsertPIN[]): Promise<PIN[]> {
    return await db.insert(pins).values(insertPins).returning();
  }

  async listPins(schoolId: string): Promise<PIN[]> {
    return await db.select().from(pins)
      .where(eq(pins.schoolId, schoolId))
      .orderBy(desc(pins.createdAt));
  }

  async updatePin(id: string, data: Partial<InsertPIN>): Promise<PIN> {
    const [pin] = await db.update(pins)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(pins.id, id))
      .returning();
    return pin;
  }

  async deletePin(id: string): Promise<void> {
    await db.delete(pins).where(eq(pins.id, id));
  }

  // PIN Requests
  async getPinRequest(id: string): Promise<PINRequest | undefined> {
    const [request] = await db.select().from(pinRequests).where(eq(pinRequests.id, id));
    return request || undefined;
  }

  async createPinRequest(request: CreatePINRequest): Promise<PINRequest> {
    const [pinRequest] = await db.insert(pinRequests).values(request).returning();
    return pinRequest;
  }

  async listPinRequests(schoolId?: string): Promise<PINRequest[]> {
    if (schoolId) {
      return await db.select().from(pinRequests)
        .where(eq(pinRequests.schoolId, schoolId))
        .orderBy(desc(pinRequests.createdAt));
    }
    return await db.select().from(pinRequests).orderBy(desc(pinRequests.createdAt));
  }

  async updatePinRequest(id: string, data: Partial<any>): Promise<PINRequest> {
    const [request] = await db.update(pinRequests)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(pinRequests.id, id))
      .returning();
    return request;
  }

  // Classes
  async getClass(id: string): Promise<Class | undefined> {
    const [classRecord] = await db.select().from(classes).where(eq(classes.id, id));
    return classRecord || undefined;
  }

  async createClass(classData: InsertClass): Promise<Class> {
    const [classRecord] = await db.insert(classes).values(classData).returning();
    return classRecord;
  }

  async updateClass(id: string, data: Partial<InsertClass>): Promise<Class> {
    const [classRecord] = await db.update(classes)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(classes.id, id))
      .returning();
    return classRecord;
  }

  async listClasses(schoolId: string): Promise<Class[]> {
    return await db.select().from(classes).where(eq(classes.schoolId, schoolId));
  }

  async deleteClass(id: string, schoolId?: string): Promise<void> {
    if (schoolId) {
      await db.delete(classes).where(and(eq(classes.id, id), eq(classes.schoolId, schoolId)));
    } else {
      await db.delete(classes).where(eq(classes.id, id));
    }
  }

  // Subjects
  async getSubject(id: string): Promise<Subject | undefined> {
    const [subject] = await db.select().from(subjects).where(eq(subjects.id, id));
    return subject || undefined;
  }

  async createSubject(subject: InsertSubject): Promise<Subject> {
    const [subjectRecord] = await db.insert(subjects).values(subject).returning();
    return subjectRecord;
  }

  async updateSubject(id: string, data: Partial<InsertSubject>): Promise<Subject> {
    const [subjectRecord] = await db.update(subjects)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(subjects.id, id))
      .returning();
    return subjectRecord;
  }

  async listSubjects(schoolId: string): Promise<Subject[]> {
    return await db.select().from(subjects).where(eq(subjects.schoolId, schoolId));
  }

  async deleteSubject(id: string, schoolId?: string): Promise<void> {
    if (schoolId) {
      await db.delete(subjects).where(and(eq(subjects.id, id), eq(subjects.schoolId, schoolId)));
    } else {
      await db.delete(subjects).where(eq(subjects.id, id));
    }
  }

  // Audit Logs
  async createAuditLog(log: InsertAuditLog): Promise<void> {
    await db.insert(auditLogs).values(log);
  }

  // Analytics
  async getDashboardStats(userId: string, role: string, schoolId?: string): Promise<any> {
    if (role === "super_admin") {
      const [schoolsCount] = await db.select({ count: sql<number>`count(*)` }).from(schools);
      const [usersCount] = await db.select({ count: sql<number>`count(*)` }).from(users);
      const [studentsCount] = await db.select({ count: sql<number>`count(*)` }).from(students);
      const [resultsCount] = await db.select({ count: sql<number>`count(*)` }).from(results);

      return {
        totalSchools: Number(schoolsCount.count),
        totalUsers: Number(usersCount.count),
        totalStudents: Number(studentsCount.count),
        totalResults: Number(resultsCount.count),
      };
    } else if (role === "school_admin" && schoolId) {
      const [studentsCount] = await db.select({ count: sql<number>`count(*)` }).from(students).where(eq(students.schoolId, schoolId));
      const [teachersCount] = await db.select({ count: sql<number>`count(*)` }).from(users).where(and(eq(users.schoolId, schoolId), eq(users.role, "teacher")));
      const [resultsCount] = await db.select({ count: sql<number>`count(*)` }).from(results).where(eq(results.schoolId, schoolId));
      const [pinsCount] = await db.select({ count: sql<number>`count(*)` }).from(pins).where(eq(pins.schoolId, schoolId));
      const [usedPinsCount] = await db.select({ count: sql<number>`count(*)` }).from(pins).where(and(eq(pins.schoolId, schoolId), eq(pins.isUsed, true)));
      const [unusedPinsCount] = await db.select({ count: sql<number>`count(*)` }).from(pins).where(and(eq(pins.schoolId, schoolId), eq(pins.isUsed, false)));
      const [pendingResults] = await db.select({ count: sql<number>`count(*)` }).from(results).where(and(eq(results.schoolId, schoolId), eq(results.status, "submitted")));
      const [approvedResults] = await db.select({ count: sql<number>`count(*)` }).from(results).where(and(eq(results.schoolId, schoolId), eq(results.status, "approved")));
      const [pendingPinRequests] = await db.select({ count: sql<number>`count(*)` }).from(pinRequests).where(and(eq(pinRequests.schoolId, schoolId), eq(pinRequests.status, "pending")));

      return {
        totalStudents: Number(studentsCount.count),
        totalUsers: Number(teachersCount.count),
        totalResults: Number(resultsCount.count),
        totalPins: Number(pinsCount.count),
        usedPins: Number(usedPinsCount.count),
        unusedPins: Number(unusedPinsCount.count),
        pendingResults: Number(pendingResults.count),
        approvedResults: Number(approvedResults.count),
        pendingPinRequests: Number(pendingPinRequests.count),
      };
    } else if (role === "teacher" && schoolId) {
      const [studentsCount] = await db.select({ count: sql<number>`count(*)` }).from(students).where(eq(students.schoolId, schoolId));
      const [resultsCount] = await db.select({ count: sql<number>`count(*)` }).from(results).where(and(eq(results.schoolId, schoolId), eq(results.uploadedBy, userId)));
      const [pendingResults] = await db.select({ count: sql<number>`count(*)` }).from(results).where(and(eq(results.schoolId, schoolId), eq(results.uploadedBy, userId), eq(results.status, "submitted")));

      return {
        totalStudents: Number(studentsCount.count),
        totalResults: Number(resultsCount.count),
        pendingResults: Number(pendingResults.count),
      };
    }

    return {};
  }

  // Score Metrics
  async getScoreMetric(id: string): Promise<ScoreMetric | undefined> {
    const [metric] = await db.select().from(scoreMetrics).where(eq(scoreMetrics.id, id));
    return metric || undefined;
  }

  async createScoreMetric(metric: InsertScoreMetric): Promise<ScoreMetric> {
    const [metricRecord] = await db.insert(scoreMetrics).values(metric).returning();
    return metricRecord;
  }

  async updateScoreMetric(id: string, data: Partial<InsertScoreMetric>): Promise<ScoreMetric> {
    const [metricRecord] = await db.update(scoreMetrics)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(scoreMetrics.id, id))
      .returning();
    return metricRecord;
  }

  async listScoreMetrics(schoolId: string): Promise<ScoreMetric[]> {
    return await db.select()
      .from(scoreMetrics)
      .where(and(eq(scoreMetrics.schoolId, schoolId), eq(scoreMetrics.isActive, true)))
      .orderBy(scoreMetrics.order);
  }

  async deleteScoreMetric(id: string): Promise<void> {
    await db.update(scoreMetrics)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(scoreMetrics.id, id));
  }

  // Class Subjects
  async getClassSubjects(classId: string): Promise<ClassSubject[]> {
    return await db.select().from(classSubjects).where(eq(classSubjects.classId, classId));
  }

  async setClassSubjects(schoolId: string, classId: string, subjectIds: string[]): Promise<ClassSubject[]> {
    await db.delete(classSubjects).where(eq(classSubjects.classId, classId));
    
    if (subjectIds.length === 0) return [];
    
    const newRecords = subjectIds.map(subjectId => ({
      schoolId,
      classId,
      subjectId,
    }));
    
    return await db.insert(classSubjects).values(newRecords).returning();
  }

  async deleteClassSubjects(classId: string): Promise<void> {
    await db.delete(classSubjects).where(eq(classSubjects.classId, classId));
  }

  // Notifications
  async getNotification(id: string): Promise<Notification | undefined> {
    const [notification] = await db.select().from(notifications).where(eq(notifications.id, id));
    return notification || undefined;
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [record] = await db.insert(notifications).values(notification).returning();
    return record;
  }

  async listNotifications(userId: string, limit: number = 50): Promise<Notification[]> {
    return await db.select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  }

  async markNotificationRead(id: string): Promise<Notification> {
    const [record] = await db.update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id))
      .returning();
    return record;
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db.update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, userId));
  }

  async countUnreadNotifications(userId: string): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    return Number(result.count);
  }

  // Teacher Assignments (enhanced)
  async getTeacherAssignments(teacherId: string): Promise<TeacherAssignment[]> {
    return await db.select().from(teacherAssignments).where(eq(teacherAssignments.teacherId, teacherId));
  }

  async createTeacherAssignment(assignment: InsertTeacherAssignment): Promise<TeacherAssignment> {
    const [record] = await db.insert(teacherAssignments).values(assignment).returning();
    return record;
  }

  async deleteTeacherAssignment(id: string): Promise<void> {
    await db.delete(teacherAssignments).where(eq(teacherAssignments.id, id));
  }

  async setTeacherAssignments(schoolId: string, teacherId: string, assignments: { classId: string; subjectId: string }[]): Promise<TeacherAssignment[]> {
    await db.delete(teacherAssignments).where(eq(teacherAssignments.teacherId, teacherId));
    
    if (assignments.length === 0) return [];
    
    const currentYear = new Date().getFullYear();
    const academicYear = `${currentYear}/${currentYear + 1}`;
    
    const newRecords = assignments.map(a => ({
      schoolId,
      teacherId,
      classId: a.classId,
      subjectId: a.subjectId,
      academicYear,
    }));
    
    return await db.insert(teacherAssignments).values(newRecords).returning();
  }

  // Result Sheets
  async getResultSheet(id: string): Promise<ResultSheet | undefined> {
    const [sheet] = await db.select().from(resultSheets).where(eq(resultSheets.id, id));
    return sheet || undefined;
  }

  async createResultSheet(sheet: InsertResultSheet): Promise<ResultSheet> {
    const [record] = await db.insert(resultSheets).values(sheet).returning();
    return record;
  }

  async updateResultSheet(id: string, data: Partial<InsertResultSheet>): Promise<ResultSheet> {
    const [record] = await db.update(resultSheets)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(resultSheets.id, id))
      .returning();
    return record;
  }

  async listResultSheets(schoolId: string, filters?: { status?: string; classId?: string; subjectId?: string; session?: string; term?: string }): Promise<ResultSheet[]> {
    const conditions = [eq(resultSheets.schoolId, schoolId)];
    
    if (filters?.status) {
      conditions.push(eq(resultSheets.status, filters.status));
    }
    if (filters?.classId) {
      conditions.push(eq(resultSheets.classId, filters.classId));
    }
    if (filters?.subjectId) {
      conditions.push(eq(resultSheets.subjectId, filters.subjectId));
    }
    if (filters?.session) {
      conditions.push(eq(resultSheets.session, filters.session));
    }
    if (filters?.term) {
      conditions.push(eq(resultSheets.term, filters.term));
    }
    
    return await db.select().from(resultSheets)
      .where(and(...conditions))
      .orderBy(desc(resultSheets.createdAt));
  }

  async deleteResultSheet(id: string): Promise<void> {
    await db.delete(resultSheetEntries).where(eq(resultSheetEntries.sheetId, id));
    await db.delete(resultSheets).where(eq(resultSheets.id, id));
  }

  async submitResultSheet(id: string, submittedBy: string): Promise<ResultSheet> {
    const [record] = await db.update(resultSheets)
      .set({ 
        status: "submitted", 
        submittedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(resultSheets.id, id))
      .returning();
    return record;
  }

  async approveResultSheet(id: string, approvedBy: string): Promise<ResultSheet> {
    const [record] = await db.update(resultSheets)
      .set({ 
        status: "approved", 
        approvedBy,
        approvedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(resultSheets.id, id))
      .returning();
    return record;
  }

  async rejectResultSheet(id: string, approvedBy: string, reason: string): Promise<ResultSheet> {
    const [record] = await db.update(resultSheets)
      .set({ 
        status: "rejected",
        approvedBy,
        approvedAt: new Date(), 
        rejectionReason: reason,
        updatedAt: new Date()
      })
      .where(eq(resultSheets.id, id))
      .returning();
    return record;
  }

  // Result Sheet Entries
  async getResultSheetEntry(id: string): Promise<ResultSheetEntry | undefined> {
    const [entry] = await db.select().from(resultSheetEntries).where(eq(resultSheetEntries.id, id));
    return entry || undefined;
  }

  async createResultSheetEntry(entry: InsertResultSheetEntry): Promise<ResultSheetEntry> {
    const [record] = await db.insert(resultSheetEntries).values(entry).returning();
    return record;
  }

  async createResultSheetEntries(entries: InsertResultSheetEntry[]): Promise<ResultSheetEntry[]> {
    if (entries.length === 0) return [];
    return await db.insert(resultSheetEntries).values(entries).returning();
  }

  async updateResultSheetEntry(id: string, data: Partial<InsertResultSheetEntry>): Promise<ResultSheetEntry> {
    const [record] = await db.update(resultSheetEntries)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(resultSheetEntries.id, id))
      .returning();
    return record;
  }

  async listResultSheetEntries(sheetId: string): Promise<ResultSheetEntry[]> {
    return await db.select().from(resultSheetEntries)
      .where(eq(resultSheetEntries.sheetId, sheetId));
  }

  async deleteResultSheetEntry(id: string): Promise<void> {
    await db.delete(resultSheetEntries).where(eq(resultSheetEntries.id, id));
  }

  async deleteResultSheetEntriesBySheet(sheetId: string): Promise<void> {
    await db.delete(resultSheetEntries).where(eq(resultSheetEntries.sheetId, sheetId));
  }

  // Aggregation - merges approved subject sheets into student results
  async aggregateStudentResults(schoolId: string, session: string, term: string): Promise<void> {
    // Get all approved sheets for this school/session/term
    const approvedSheets = await db.select()
      .from(resultSheets)
      .where(and(
        eq(resultSheets.schoolId, schoolId),
        eq(resultSheets.session, session),
        eq(resultSheets.term, term),
        eq(resultSheets.status, "approved")
      ));

    if (approvedSheets.length === 0) return;

    // Get all entries for approved sheets
    const sheetIds = approvedSheets.map(s => s.id);
    const allEntries = await db.select()
      .from(resultSheetEntries)
      .where(inArray(resultSheetEntries.sheetId, sheetIds));

    // Get subject info for sheet-to-subject mapping
    const sheetSubjectMap = new Map<string, string>();
    for (const sheet of approvedSheets) {
      sheetSubjectMap.set(sheet.id, sheet.subjectId);
    }

    // Get class info for sheet-to-class mapping
    const sheetClassMap = new Map<string, string>();
    for (const sheet of approvedSheets) {
      sheetClassMap.set(sheet.id, sheet.classId);
    }

    // Get all subjects for name lookup
    const subjectList = await db.select().from(subjects).where(eq(subjects.schoolId, schoolId));
    const subjectNameMap = new Map<string, string>();
    for (const subj of subjectList) {
      subjectNameMap.set(subj.id, subj.name);
    }

    // Get all classes for name lookup
    const classList = await db.select().from(classes).where(eq(classes.schoolId, schoolId));
    const classNameMap = new Map<string, string>();
    for (const cls of classList) {
      classNameMap.set(cls.id, cls.name);
    }

    // Group entries by student
    const studentSubjects = new Map<string, Array<{
      subject: string;
      ca1: number;
      ca2: number;
      exam: number;
      total: number;
      grade: string | null;
      remark: string | null;
    }>>();
    const studentClassMap = new Map<string, string>();

    for (const entry of allEntries) {
      const subjectId = sheetSubjectMap.get(entry.sheetId);
      const classId = sheetClassMap.get(entry.sheetId);
      if (!subjectId || !classId) continue;

      const subjectName = subjectNameMap.get(subjectId) || "Unknown";
      const className = classNameMap.get(classId) || "Unknown";
      
      studentClassMap.set(entry.studentId, className);
      
      if (!studentSubjects.has(entry.studentId)) {
        studentSubjects.set(entry.studentId, []);
      }
      
      studentSubjects.get(entry.studentId)!.push({
        subject: subjectName,
        ca1: parseFloat(entry.ca1) || 0,
        ca2: parseFloat(entry.ca2) || 0,
        exam: parseFloat(entry.exam) || 0,
        total: parseFloat(entry.total) || 0,
        grade: entry.grade,
        remark: entry.remark,
      });
    }

    // For each student, create or update their aggregated result
    const studentIds = Array.from(studentSubjects.keys());
    for (const studentId of studentIds) {
      const subjectScores = studentSubjects.get(studentId)!;
      const className = studentClassMap.get(studentId) || "";
      
      // Calculate overall totals
      const totalScore = subjectScores.reduce((sum: number, s: { total: number }) => sum + s.total, 0);
      const averageScore = subjectScores.length > 0 ? totalScore / subjectScores.length : 0;
      
      // Check if result exists
      const existingResult = await this.getResultByStudentSessionTerm(studentId, session, term);
      
      if (existingResult) {
        // Update existing result with new subjects array
        await db.update(results)
          .set({
            subjects: subjectScores,
            totalScore: totalScore.toFixed(2),
            averageScore: averageScore.toFixed(2),
            status: "approved",
            updatedAt: new Date(),
          })
          .where(eq(results.id, existingResult.id));
      } else {
        // Get student for school linkage
        const student = await this.getStudent(studentId);
        if (!student) continue;
        
        // Create new aggregated result
        await db.insert(results).values({
          schoolId,
          studentId,
          session,
          term: term as "First" | "Second" | "Third",
          class: className,
          subjects: subjectScores,
          totalScore: totalScore.toFixed(2),
          averageScore: averageScore.toFixed(2),
          status: "approved",
          uploadedBy: approvedSheets[0].submittedBy,
        });
      }
    }

    // Mark approved sheets as published
    for (const sheet of approvedSheets) {
      await db.update(resultSheets)
        .set({ status: "published", updatedAt: new Date() })
        .where(eq(resultSheets.id, sheet.id));
    }
  }

  // New incremental merge method - merges a single approved sheet into student results
  async mergeSheetIntoStudentResults(sheetId: string): Promise<void> {
    // Get the sheet
    const sheet = await this.getResultSheet(sheetId);
    if (!sheet) {
      throw new Error("Result sheet not found");
    }

    // Get all entries for this sheet
    const entries = await this.listResultSheetEntries(sheetId);
    if (entries.length === 0) return;

    // Get subject name
    const subject = await this.getSubject(sheet.subjectId);
    const subjectName = subject?.name || "Unknown Subject";

    // Get class name
    const classInfo = await this.getClass(sheet.classId);
    const className = classInfo?.name || "Unknown Class";

    // Process each student entry
    for (const entry of entries) {
      // Build the subject score object
      const subjectScore = {
        subject: subjectName,
        subjectId: sheet.subjectId,
        ca1: parseFloat(entry.ca1) || 0,
        ca2: parseFloat(entry.ca2) || 0,
        exam: parseFloat(entry.exam) || 0,
        total: parseFloat(entry.total) || 0,
        grade: entry.grade || "",
        remark: entry.remark || "",
        sheetId: sheet.id,
      };

      // Check if student already has a result for this session/term
      const existingResult = await this.getResultByStudentSessionTerm(
        entry.studentId, 
        sheet.session, 
        sheet.term
      );

      if (existingResult) {
        // Merge the subject into existing subjects array
        let existingSubjects = Array.isArray(existingResult.subjects) 
          ? [...existingResult.subjects] 
          : [];

        // Find if this subject already exists (by subjectId or subject name)
        const subjectIndex = existingSubjects.findIndex(
          (s: any) => s.subjectId === sheet.subjectId || s.subject === subjectName
        );

        if (subjectIndex >= 0) {
          // Update existing subject entry
          existingSubjects[subjectIndex] = subjectScore;
        } else {
          // Add new subject
          existingSubjects.push(subjectScore);
        }

        // Recalculate totals
        const totalScore = existingSubjects.reduce(
          (sum: number, s: any) => sum + (parseFloat(s.total) || 0), 
          0
        );
        const averageScore = existingSubjects.length > 0 
          ? totalScore / existingSubjects.length 
          : 0;

        // Update the result
        await db.update(results)
          .set({
            subjects: existingSubjects,
            totalScore: totalScore.toFixed(2),
            averageScore: averageScore.toFixed(2),
            class: className,
            status: "approved",
            updatedAt: new Date(),
          })
          .where(eq(results.id, existingResult.id));
      } else {
        // Create new result for this student
        const student = await this.getStudent(entry.studentId);
        if (!student) continue;

        const totalScore = subjectScore.total;
        const averageScore = totalScore; // Only one subject for now

        await db.insert(results).values({
          schoolId: sheet.schoolId,
          studentId: entry.studentId,
          session: sheet.session,
          term: sheet.term as "First" | "Second" | "Third",
          class: className,
          subjects: [subjectScore],
          totalScore: totalScore.toFixed(2),
          averageScore: averageScore.toFixed(2),
          status: "approved",
          uploadedBy: sheet.submittedBy,
        });
      }
    }
  }

  // Re-aggregate results by merging all approved/published sheets for a session/term
  // This preserves existing result metadata while updating subject scores
  async reaggregateResults(schoolId: string, session: string, term: string): Promise<number> {
    // Get all approved or published sheets for this session/term
    const sheetsToMerge = await db.select()
      .from(resultSheets)
      .where(and(
        eq(resultSheets.schoolId, schoolId),
        eq(resultSheets.session, session),
        eq(resultSheets.term, term),
        inArray(resultSheets.status, ["approved", "published"])
      ));

    if (sheetsToMerge.length === 0) {
      return 0;
    }

    // Get all student IDs that will be affected
    const sheetIds = sheetsToMerge.map(s => s.id);
    const allEntries = await db.select()
      .from(resultSheetEntries)
      .where(inArray(resultSheetEntries.sheetId, sheetIds));

    const affectedStudentIds = Array.from(new Set(allEntries.map(e => e.studentId)));

    // For each affected student, rebuild their subjects array from approved sheets
    for (const studentId of affectedStudentIds) {
      // Get existing result to preserve metadata (comments, etc.)
      const existingResult = await this.getResultByStudentSessionTerm(studentId, session, term);

      // Build subjects array from all approved sheets
      const studentEntries = allEntries.filter(e => e.studentId === studentId);
      const subjectsMap = new Map<string, any>();

      for (const entry of studentEntries) {
        const sheet = sheetsToMerge.find(s => s.id === entry.sheetId);
        if (!sheet) continue;

        const subject = await this.getSubject(sheet.subjectId);
        const subjectName = subject?.name || "Unknown Subject";

        subjectsMap.set(sheet.subjectId, {
          subject: subjectName,
          subjectId: sheet.subjectId,
          ca1: parseFloat(entry.ca1) || 0,
          ca2: parseFloat(entry.ca2) || 0,
          exam: parseFloat(entry.exam) || 0,
          total: parseFloat(entry.total) || 0,
          grade: entry.grade || "",
          remark: entry.remark || "",
          sheetId: entry.sheetId,
        });
      }

      const subjectScores = Array.from(subjectsMap.values());
      const totalScore = subjectScores.reduce((sum, s) => sum + s.total, 0);
      const averageScore = subjectScores.length > 0 ? totalScore / subjectScores.length : 0;

      // Get class name from first sheet
      const firstSheet = sheetsToMerge.find(s => 
        allEntries.some(e => e.sheetId === s.id && e.studentId === studentId)
      );
      const classInfo = firstSheet ? await this.getClass(firstSheet.classId) : null;
      const className = classInfo?.name || existingResult?.class || "";

      if (existingResult) {
        // Update existing result, preserving comments and other metadata
        await db.update(results)
          .set({
            subjects: subjectScores,
            totalScore: totalScore.toFixed(2),
            averageScore: averageScore.toFixed(2),
            class: className,
            updatedAt: new Date(),
          })
          .where(eq(results.id, existingResult.id));
      } else {
        // Create new result
        const student = await this.getStudent(studentId);
        if (!student) continue;

        await db.insert(results).values({
          schoolId,
          studentId,
          session,
          term: term as "First" | "Second" | "Third",
          class: className,
          subjects: subjectScores,
          totalScore: totalScore.toFixed(2),
          averageScore: averageScore.toFixed(2),
          status: "approved",
          uploadedBy: sheetsToMerge[0].submittedBy,
        });
      }
    }

    return sheetsToMerge.length;
  }

  // Delete & Archive Operations - MUST include schoolId for multi-tenant isolation
  async deleteResultSheets(ids: string[], schoolId: string): Promise<void> {
    if (ids.length === 0) return;
    
    // Verify all sheets belong to the school (multi-tenant isolation)
    const sheetsToDelete = await db.select().from(resultSheets)
      .where(and(
        inArray(resultSheets.id, ids),
        eq(resultSheets.schoolId, schoolId)
      ));
    
    const validIds = sheetsToDelete.map(s => s.id);
    if (validIds.length === 0) return;
    
    // First delete all entries for these sheets
    await db.delete(resultSheetEntries).where(inArray(resultSheetEntries.sheetId, validIds));
    
    // Then delete the sheets
    await db.delete(resultSheets).where(inArray(resultSheets.id, validIds));
  }

  async archiveResultSheets(ids: string[], schoolId: string, archivedBy: string): Promise<void> {
    if (ids.length === 0) return;
    
    // Get the sheets to archive - MUST filter by schoolId for multi-tenant isolation
    const sheetsToArchive = await db.select().from(resultSheets)
      .where(and(
        inArray(resultSheets.id, ids),
        eq(resultSheets.schoolId, schoolId)
      ));
    
    if (sheetsToArchive.length === 0) return;
    
    // Use transaction for atomic archive operation
    const archivedSheetIds: string[] = [];
    const originalSheetIds = sheetsToArchive.map(s => s.id);
    
    try {
      for (const sheet of sheetsToArchive) {
        // Insert into archived table
        const [archivedSheet] = await db.insert(archivedResultSheets).values({
          originalId: sheet.id,
          schoolId: sheet.schoolId,
          classId: sheet.classId,
          subjectId: sheet.subjectId,
          session: sheet.session,
          term: sheet.term,
          status: sheet.status,
          submittedBy: sheet.submittedBy,
          submittedAt: sheet.submittedAt,
          approvedBy: sheet.approvedBy,
          approvedAt: sheet.approvedAt,
          rejectionReason: sheet.rejectionReason,
          originalCreatedAt: sheet.createdAt,
          archivedBy,
        }).returning();
        
        archivedSheetIds.push(archivedSheet.id);
        
        // Get and archive entries
        const entries = await db.select().from(resultSheetEntries).where(eq(resultSheetEntries.sheetId, sheet.id));
        
        if (entries.length > 0) {
          await db.insert(archivedResultSheetEntries).values(
            entries.map(entry => ({
              originalId: entry.id,
              archivedSheetId: archivedSheet.id,
              studentId: entry.studentId,
              ca1: entry.ca1,
              ca2: entry.ca2,
              exam: entry.exam,
              total: entry.total,
              grade: entry.grade,
              remark: entry.remark,
              originalCreatedAt: entry.createdAt,
            }))
          );
        }
      }
      
      // Delete entries and sheets after archiving
      await db.delete(resultSheetEntries).where(inArray(resultSheetEntries.sheetId, originalSheetIds));
      await db.delete(resultSheets).where(inArray(resultSheets.id, originalSheetIds));
    } catch (error) {
      // Clean up any archived data if there's a failure
      if (archivedSheetIds.length > 0) {
        await db.delete(archivedResultSheetEntries).where(inArray(archivedResultSheetEntries.archivedSheetId, archivedSheetIds));
        await db.delete(archivedResultSheets).where(inArray(archivedResultSheets.id, archivedSheetIds));
      }
      throw error;
    }
  }

  async deleteResults(ids: string[], schoolId: string): Promise<void> {
    if (ids.length === 0) return;
    
    // Filter by schoolId for multi-tenant isolation
    await db.delete(results)
      .where(and(
        inArray(results.id, ids),
        eq(results.schoolId, schoolId)
      ));
  }

  async archiveResults(ids: string[], schoolId: string, archivedBy: string): Promise<void> {
    if (ids.length === 0) return;
    
    // Get the results to archive - MUST filter by schoolId for multi-tenant isolation
    const resultsToArchive = await db.select().from(results)
      .where(and(
        inArray(results.id, ids),
        eq(results.schoolId, schoolId)
      ));
    
    if (resultsToArchive.length === 0) return;
    
    const originalIds = resultsToArchive.map(r => r.id);
    
    for (const result of resultsToArchive) {
      // Insert into archived table
      await db.insert(archivedResults).values({
        originalId: result.id,
        schoolId: result.schoolId,
        studentId: result.studentId,
        session: result.session,
        term: result.term,
        class: result.class,
        subjects: result.subjects,
        totalScore: result.totalScore,
        averageScore: result.averageScore,
        position: result.position,
        totalStudents: result.totalStudents,
        teacherComment: result.teacherComment,
        principalComment: result.principalComment,
        attendance: result.attendance,
        status: result.status,
        publishedAt: result.publishedAt,
        approvedBy: result.approvedBy,
        approvedAt: result.approvedAt,
        rejectionReason: result.rejectionReason,
        uploadedBy: result.uploadedBy,
        originalCreatedAt: result.createdAt,
        archivedBy,
      });
    }
    
    // Delete results after archiving - use filtered IDs
    await db.delete(results).where(inArray(results.id, originalIds));
  }

  // Position Calculation
  async calculateAndUpdatePositions(schoolId: string, session: string, term: string, classId?: string): Promise<number> {
    // Get all results for the given school, session, term (optionally filtered by class)
    const conditions = [
      eq(results.schoolId, schoolId),
      eq(results.session, session),
      eq(results.term, term),
    ];
    
    if (classId) {
      conditions.push(eq(results.class, classId));
    }
    
    const allResults = await db.select().from(results).where(and(...conditions));
    
    if (allResults.length === 0) return 0;
    
    // Group results by class
    type ResultItem = typeof allResults[number];
    const resultsByClass: Record<string, ResultItem[]> = {};
    for (const result of allResults) {
      const classKey = result.class || 'unknown';
      if (!resultsByClass[classKey]) {
        resultsByClass[classKey] = [];
      }
      resultsByClass[classKey].push(result);
    }
    
    let updatedCount = 0;
    
    // Calculate positions within each class
    for (const classKey of Object.keys(resultsByClass)) {
      const classResults = resultsByClass[classKey];
      
      // Sort by total score descending, then by average score descending as tiebreaker
      classResults.sort((a: ResultItem, b: ResultItem) => {
        const totalA = parseFloat(a.totalScore || '0');
        const totalB = parseFloat(b.totalScore || '0');
        
        // First compare by total score
        if (totalB !== totalA) {
          return totalB - totalA;
        }
        
        // If total scores are equal, compare by average score
        const avgA = parseFloat(a.averageScore || '0');
        const avgB = parseFloat(b.averageScore || '0');
        return avgB - avgA;
      });
      
      const totalStudentsCount = classResults.length;
      let currentPosition = 1;
      let previousTotal: number | null = null;
      let previousAverage: number | null = null;
      
      for (let i = 0; i < classResults.length; i++) {
        const result = classResults[i];
        const currentTotal = parseFloat(result.totalScore || '0');
        const currentAverage = parseFloat(result.averageScore || '0');
        
        // Update position if total score or average score differs from previous
        if (previousTotal !== null && previousAverage !== null) {
          if (currentTotal !== previousTotal || currentAverage !== previousAverage) {
            currentPosition = i + 1;
          }
          // If both are same, keep same position (tied)
        } else {
          currentPosition = i + 1;
        }
        
        previousTotal = currentTotal;
        previousAverage = currentAverage;
        
        // Update the result with position and total students
        await db.update(results)
          .set({ 
            position: currentPosition,
            totalStudents: totalStudentsCount
          })
          .where(eq(results.id, result.id));
        
        updatedCount++;
      }
    }
    
    return updatedCount;
  }
}

export const storage = new DatabaseStorage();

