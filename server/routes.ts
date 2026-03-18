import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { authenticate, authorize, JWT_SECRET, type AuthRequest } from "./middleware/auth";
import { calculateResults, generatePIN, getGradeAndRemark } from "./utils/result-calculator";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { insertUserSchema, insertStudentSchema, insertResultSchema, insertPinRequestSchema, GradeRange, DEFAULT_GRADE_RANGES, gradeRangeSchema } from "@shared/schema";
import { z } from "zod";

// Helper function to get school's grade configuration
async function getSchoolGradeRanges(schoolId: string): Promise<GradeRange[]> {
  const school = await storage.getSchool(schoolId);
  if (school?.gradeRanges && Array.isArray(school.gradeRanges) && school.gradeRanges.length > 0) {
    return school.gradeRanges as GradeRange[];
  }
  return DEFAULT_GRADE_RANGES;
}

// Legacy helper functions - now use configurable grade ranges
function calculateGrade(total: number, gradeRanges?: GradeRange[]): string {
  const { grade } = getGradeAndRemark(total, gradeRanges);
  return grade;
}

function getGradeRemarkFromTotal(total: number, gradeRanges?: GradeRange[]): string {
  const { remark } = getGradeAndRemark(total, gradeRanges);
  return remark;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // ===== AUTHENTICATION ROUTES =====
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      await storage.updateUser(user.id, { lastLogin: new Date() });

      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role, schoolId: user.schoolId },
        JWT_SECRET,
        { expiresIn: "30d" }
      );

      const { password: _, ...userWithoutPassword } = user;

      res.json({ token, user: userWithoutPassword });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/auth/register", authenticate, authorize("super_admin", "school_admin"), async (req: AuthRequest, res) => {
    try {
      const validated = insertUserSchema.parse(req.body);
      const hashedPassword = await bcrypt.hash(validated.password, 10);

      const user = await storage.createUser({
        ...validated,
        password: hashedPassword,
        createdBy: req.user!.id,
      });

      const { password: _, ...userWithoutPassword } = user;
      res.status(201).json(userWithoutPassword);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/auth/me", authenticate, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ===== SCHOOLS ROUTES =====
  app.get("/api/schools", authenticate, authorize("super_admin"), async (req, res) => {
    try {
      const schools = await storage.listSchools();
      res.json(schools);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get current user's school (for school_admin and teacher)
  app.get("/api/schools/me", authenticate, async (req: AuthRequest, res) => {
    try {
      if (!req.user!.schoolId) {
        return res.status(404).json({ message: "No school associated with this user" });
      }
      const school = await storage.getSchool(req.user!.schoolId);
      if (!school) {
        return res.status(404).json({ message: "School not found" });
      }
      res.json(school);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get single school by ID - MUST come after /me route
  app.get("/api/schools/:id", authenticate, async (req: AuthRequest, res) => {
    try {
      // Verify user has access to this school
      if (req.user!.role !== 'super_admin' && req.params.id !== req.user!.schoolId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const school = await storage.getSchool(req.params.id);
      if (!school) {
        return res.status(404).json({ message: "School not found" });
      }
      res.json(school);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/schools", authenticate, authorize("super_admin"), async (req: AuthRequest, res) => {
    try {
      const { name, code, email, subdomain, logo, initialPassword } = req.body;

      if (!name || !email || !subdomain) {
        return res.status(400).json({ message: "Name, email and subdomain are required" });
      }

      // Check if subdomain already exists
      const existingSchool = await storage.getSchoolBySubdomain(subdomain);
      if (existingSchool) {
        return res.status(400).json({ message: "Subdomain is already in use" });
      }

      // Check if email is already used
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "Email is already registered" });
      }

      // Generate school code if not provided
      const schoolCode = code || name.replace(/[^a-zA-Z]/g, "").substring(0, 3).toUpperCase() +
        Math.floor(1000 + Math.random() * 9000);

      // Create the school first
      const school = await storage.createSchool({
        name,
        code: schoolCode,
        subdomain: subdomain.toLowerCase(),
        email,
        logo: logo || null,
        isActive: true, // Super admin created schools are automatically active
        createdBy: req.user!.id,
      });

      // Create school admin user if initialPassword is provided
      if (initialPassword) {
        const hashedPassword = await bcrypt.hash(initialPassword, 10);
        await storage.createUser({
          email,
          password: hashedPassword,
          firstName: "School",
          lastName: "Admin",
          role: "school_admin",
          schoolId: school.id,
          isActive: true,
          createdBy: req.user!.id,
        });
      }

      res.status(201).json(school);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.put("/api/schools/:id", authenticate, authorize("super_admin"), async (req, res) => {
    try {
      const school = await storage.updateSchool(req.params.id, req.body);
      res.json(school);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // School admin can update their own school (logo, motto, address, phone, gradeRanges, computationMode)
  app.patch("/api/schools/:id", authenticate, authorize("school_admin"), async (req: AuthRequest, res) => {
    try {
      // Verify school belongs to user
      if (req.params.id !== req.user!.schoolId) {
        return res.status(403).json({ message: "Cannot update other schools" });
      }

      // Only allow specific fields to be updated by school admin
      const { logo, motto, address, phone, gradeRanges, computationMode } = req.body;
      const updateData: any = {};

      if (logo !== undefined) updateData.logo = logo;
      if (motto !== undefined) updateData.motto = motto;
      if (address !== undefined) updateData.address = address;
      if (phone !== undefined) updateData.phone = phone;
      if (gradeRanges !== undefined) {
        // Validate grade ranges
        if (Array.isArray(gradeRanges)) {
          const validRanges = gradeRanges.every((r: any) =>
            r.grade && typeof r.minScore === 'number' && typeof r.maxScore === 'number' && r.remark
          );
          if (validRanges) {
            updateData.gradeRanges = gradeRanges;
          }
        }
      }
      if (computationMode !== undefined) {
        if (['total_average_only', 'position_average_only', 'total_average_position'].includes(computationMode)) {
          updateData.computationMode = computationMode;
        }
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      const school = await storage.updateSchool(req.params.id, updateData);
      res.json(school);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Update school's grade configuration (dedicated endpoint)
  app.patch("/api/schools/:id/grading", authenticate, authorize("school_admin"), async (req: AuthRequest, res) => {
    try {
      // Verify school belongs to user
      if (req.params.id !== req.user!.schoolId) {
        return res.status(403).json({ message: "Cannot update other schools" });
      }

      const { gradeRanges, computationMode } = req.body;
      const updateData: any = {};

      // Validate grade ranges
      if (gradeRanges !== undefined) {
        if (!Array.isArray(gradeRanges)) {
          return res.status(400).json({ message: "gradeRanges must be an array" });
        }
        for (const range of gradeRanges) {
          const result = gradeRangeSchema.safeParse(range);
          if (!result.success) {
            return res.status(400).json({ message: `Invalid grade range: ${result.error.message}` });
          }
        }
        updateData.gradeRanges = gradeRanges;
      }

      // Validate computation mode
      if (computationMode !== undefined) {
        if (!['total_average_only', 'position_average_only', 'total_average_position'].includes(computationMode)) {
          return res.status(400).json({
            message: "computationMode must be one of: total_average_only, position_average_only, total_average_position"
          });
        }
        updateData.computationMode = computationMode;
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      const school = await storage.updateSchool(req.params.id, updateData);
      res.json({
        gradeRanges: school.gradeRanges || DEFAULT_GRADE_RANGES,
        computationMode: school.computationMode || 'total_average_only'
      });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Get school's grade configuration
  app.get("/api/schools/:id/grading", authenticate, async (req: AuthRequest, res) => {
    try {
      // Verify user has access to this school
      if (req.user!.role !== 'super_admin' && req.params.id !== req.user!.schoolId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const school = await storage.getSchool(req.params.id);
      if (!school) {
        return res.status(404).json({ message: "School not found" });
      }

      res.json({
        gradeRanges: school.gradeRanges || DEFAULT_GRADE_RANGES,
        computationMode: school.computationMode || 'total_average_only'
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Activate/Deactivate school
  app.patch("/api/schools/:id/status", authenticate, authorize("super_admin"), async (req: AuthRequest, res) => {
    try {
      const { isActive } = req.body;
      if (typeof isActive !== "boolean") {
        return res.status(400).json({ message: "isActive must be a boolean" });
      }

      const school = await storage.getSchool(req.params.id);
      if (!school) {
        return res.status(404).json({ message: "School not found" });
      }

      const updated = await storage.updateSchool(req.params.id, { isActive });

      // Create audit log
      await storage.createAuditLog({
        userId: req.user!.id,
        action: isActive ? "activate_school" : "deactivate_school",
        resource: "school",
        resourceId: req.params.id,
        details: { schoolName: school.name, isActive },
      });

      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/schools/:id", authenticate, authorize("super_admin"), async (req, res) => {
    try {
      await storage.deleteSchool(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ===== STUDENTS ROUTES =====
  app.get("/api/students", authenticate, async (req: AuthRequest, res) => {
    try {
      if (!req.user!.schoolId && req.user!.role !== "super_admin") {
        return res.status(403).json({ message: "School association required" });
      }

      const schoolId = req.user!.role === "super_admin"
        ? req.query.schoolId as string
        : req.user!.schoolId!;

      if (!schoolId) {
        return res.status(400).json({ message: "School ID required" });
      }

      const students = await storage.listStudents(schoolId);
      res.json(students);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/students", authenticate, authorize("school_admin", "teacher"), async (req: AuthRequest, res) => {
    try {
      const validated = insertStudentSchema.parse(req.body);

      // Ensure student belongs to user's school
      if (validated.schoolId !== req.user!.schoolId) {
        return res.status(403).json({ message: "Cannot create students for other schools" });
      }

      const student = await storage.createStudent(validated);
      res.status(201).json(student);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Get single student by ID
  app.get("/api/students/:id", authenticate, async (req: AuthRequest, res) => {
    try {
      const student = await storage.getStudent(req.params.id);
      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }

      // Verify student belongs to user's school (except super admin)
      if (req.user!.role !== "super_admin" && student.schoolId !== req.user!.schoolId) {
        return res.status(403).json({ message: "Cannot access students from other schools" });
      }

      res.json(student);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/students/:id", authenticate, authorize("school_admin", "teacher"), async (req: AuthRequest, res) => {
    try {
      const existing = await storage.getStudent(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Student not found" });
      }

      // Verify student belongs to user's school
      if (existing.schoolId !== req.user!.schoolId) {
        return res.status(403).json({ message: "Cannot update students from other schools" });
      }

      const student = await storage.updateStudent(req.params.id, req.body);
      res.json(student);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/students/:id", authenticate, authorize("school_admin"), async (req: AuthRequest, res) => {
    try {
      const existing = await storage.getStudent(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Student not found" });
      }

      // Verify student belongs to user's school
      if (existing.schoolId !== req.user!.schoolId) {
        return res.status(403).json({ message: "Cannot delete students from other schools" });
      }

      await storage.deleteStudent(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ===== RESULTS ROUTES =====
  app.get("/api/results", authenticate, async (req: AuthRequest, res) => {
    try {
      if (!req.user!.schoolId && req.user!.role !== "super_admin") {
        return res.status(403).json({ message: "School association required" });
      }

      const schoolId = req.user!.role === "super_admin"
        ? req.query.schoolId as string
        : req.user!.schoolId!;

      if (!schoolId) {
        return res.status(400).json({ message: "School ID required" });
      }

      const filters = {
        status: req.query.status as string,
        session: req.query.session as string,
        term: req.query.term as string,
      };

      const results = await storage.listResults(schoolId, filters);
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/results", authenticate, authorize("teacher"), async (req: AuthRequest, res) => {
    try {
      const validated = insertResultSchema.parse(req.body);

      // Verify result belongs to user's school
      if (validated.schoolId !== req.user!.schoolId) {
        return res.status(403).json({ message: "Cannot create results for other schools" });
      }

      // Verify student belongs to same school
      const student = await storage.getStudent(validated.studentId);
      if (!student || student.schoolId !== req.user!.schoolId) {
        return res.status(403).json({ message: "Student not found or belongs to another school" });
      }

      // Get school's grade configuration
      const gradeRanges = await getSchoolGradeRanges(req.user!.schoolId!);

      // Auto-calculate grades and totals using school's grade config
      const calculated = calculateResults(validated.subjects, gradeRanges);

      const result = await storage.createResult({
        ...validated,
        subjects: calculated.subjects,
        totalScore: String(calculated.totalScore),
        averageScore: String(calculated.averageScore),
        status: "draft",
        uploadedBy: req.user!.id,
      });

      res.status(201).json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Note: Result workflow routes (submit, approve, reject, comment, publish) are defined later in the file
  // using POST methods for consistency. The PATCH versions have been removed to avoid duplication.

  // Bulk actions for student results (delete/archive) - MUST come before /:id route
  app.post("/api/results/bulk-action", authenticate, authorize("school_admin", "super_admin"), async (req: AuthRequest, res) => {
    try {
      const { ids, action } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "No results selected" });
      }

      if (!["delete", "archive"].includes(action)) {
        return res.status(400).json({ message: "Invalid action. Use 'delete' or 'archive'" });
      }

      // Get schoolId - for super_admin, we need to verify from the first result
      let schoolId = req.user!.schoolId;

      // Verify all results belong to user's school
      for (const id of ids) {
        const result = await storage.getResult(id);
        if (!result) {
          return res.status(404).json({ message: `Result ${id} not found` });
        }
        if (req.user!.role === "super_admin") {
          // For super admin, use the schoolId from the first result
          if (!schoolId) schoolId = result.schoolId;
        } else if (result.schoolId !== req.user!.schoolId) {
          return res.status(403).json({ message: "Cannot modify results from other schools" });
        }
      }

      if (!schoolId) {
        return res.status(400).json({ message: "School ID required" });
      }

      if (action === "delete") {
        await storage.deleteResults(ids, schoolId);
      } else {
        await storage.archiveResults(ids, schoolId, req.user!.id);
      }

      // Create audit log
      await storage.createAuditLog({
        userId: req.user!.id,
        action: `bulk_${action}_results`,
        resource: "result",
        details: { ids, count: ids.length },
      });

      res.json({ message: `Successfully ${action}d ${ids.length} result(s)` });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ===== RESULT SHEETS ROUTES =====
  // List result sheets (teachers see their own, admins see all for their school)
  app.get("/api/result-sheets", authenticate, async (req: AuthRequest, res) => {
    try {
      if (!req.user!.schoolId) {
        return res.status(403).json({ message: "School association required" });
      }

      const filters = {
        status: req.query.status as string,
        classId: req.query.classId as string,
        subjectId: req.query.subjectId as string,
        session: req.query.session as string,
        term: req.query.term as string,
      };

      let sheets = await storage.listResultSheets(req.user!.schoolId, filters);

      // Teachers only see sheets they submitted - strict filtering
      if (req.user!.role === "teacher") {
        sheets = sheets.filter(s => s.submittedBy === req.user!.id);
      }

      res.json(sheets);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get a single result sheet with its entries
  app.get("/api/result-sheets/:id", authenticate, async (req: AuthRequest, res) => {
    try {
      const sheet = await storage.getResultSheet(req.params.id);
      if (!sheet) {
        return res.status(404).json({ message: "Result sheet not found" });
      }

      // Verify sheet belongs to user's school
      if (sheet.schoolId !== req.user!.schoolId) {
        return res.status(403).json({ message: "Cannot access result sheets from other schools" });
      }

      // Get entries for the sheet
      const entries = await storage.listResultSheetEntries(sheet.id);

      // Enrich entries with student names
      const allStudents = await storage.listStudents(req.user!.schoolId!);
      const studentMap = new Map(allStudents.map(s => [s.id, s]));

      const enrichedEntries = entries.map(entry => {
        const student = studentMap.get(entry.studentId);
        const studentName = student
          ? `${student.firstName} ${student.lastName}`
          : "Unknown Student";
        return {
          ...entry,
          studentName,
          admissionNumber: student?.admissionNumber || "",
        };
      });

      res.json({ sheet, entries: enrichedEntries });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Create a new result sheet (teacher only)
  app.post("/api/result-sheets", authenticate, authorize("teacher"), async (req: AuthRequest, res) => {
    try {
      const { classId, subjectId, session, term, entries } = req.body;

      if (!classId || !subjectId || !session || !term) {
        return res.status(400).json({ message: "Class, subject, session, and term are required" });
      }

      // Verify class and subject exist and belong to user's school
      const classRecord = await storage.getClass(classId);
      if (!classRecord || classRecord.schoolId !== req.user!.schoolId) {
        return res.status(400).json({ message: "Invalid class" });
      }

      const subject = await storage.getSubject(subjectId);
      if (!subject || subject.schoolId !== req.user!.schoolId) {
        return res.status(400).json({ message: "Invalid subject" });
      }

      // Check teacher assignment (teacher must be assigned to this class+subject)
      const assignments = await storage.getTeacherAssignments(req.user!.id);
      const isAssigned = assignments.some(a => a.classId === classId && a.subjectId === subjectId);
      if (!isAssigned) {
        return res.status(403).json({ message: "You are not assigned to teach this subject for this class" });
      }

      // Check if a sheet already exists for THIS TEACHER for this class/subject/session/term
      const allExistingSheets = await storage.listResultSheets(req.user!.schoolId!, {
        classId,
        subjectId,
        session,
        term,
      });

      // Filter to only this teacher's sheets
      const myExistingSheets = allExistingSheets.filter(s => s.submittedBy === req.user!.id);

      // Allow editing existing draft sheets (only the current teacher's)
      const existingDraft = myExistingSheets.find(s => s.status === "draft");
      if (existingDraft) {
        // Update existing draft instead of creating new
        await storage.deleteResultSheetEntriesBySheet(existingDraft.id);

        // Create new entries
        if (entries && entries.length > 0) {
          const entriesToCreate = entries.map((e: any) => {
            const ca1 = parseFloat(e.ca1) || 0;
            const ca2 = parseFloat(e.ca2) || 0;
            const exam = parseFloat(e.exam) || 0;
            const total = ca1 + ca2 + exam;
            const grade = calculateGrade(total);
            const remark = getGradeRemarkFromTotal(total);

            return {
              sheetId: existingDraft.id,
              studentId: e.studentId,
              ca1: String(ca1),
              ca2: String(ca2),
              exam: String(exam),
              total: String(total),
              grade,
              remark,
            };
          });

          await storage.createResultSheetEntries(entriesToCreate);
        }

        const updatedEntries = await storage.listResultSheetEntries(existingDraft.id);
        return res.json({ sheet: existingDraft, entries: updatedEntries });
      }

      // Check if THIS TEACHER already has an active sheet (submitted/approved/published)
      const myActiveSheet = myExistingSheets.find(s => s.status !== "draft" && s.status !== "rejected");
      if (myActiveSheet) {
        return res.status(400).json({
          message: `You already have a result sheet for this class/subject with status: ${myActiveSheet.status}`
        });
      }

      // Create new sheet
      const sheet = await storage.createResultSheet({
        schoolId: req.user!.schoolId!,
        classId,
        subjectId,
        session,
        term,
        status: "draft",
        submittedBy: req.user!.id,
      });

      // Create entries
      if (entries && entries.length > 0) {
        const entriesToCreate = entries.map((e: any) => {
          const ca1 = parseFloat(e.ca1) || 0;
          const ca2 = parseFloat(e.ca2) || 0;
          const exam = parseFloat(e.exam) || 0;
          const total = ca1 + ca2 + exam;
          const grade = calculateGrade(total);
          const remark = getGradeRemarkFromTotal(total);

          return {
            sheetId: sheet.id,
            studentId: e.studentId,
            ca1: String(ca1),
            ca2: String(ca2),
            exam: String(exam),
            total: String(total),
            grade,
            remark,
          };
        });

        await storage.createResultSheetEntries(entriesToCreate);
      }

      const createdEntries = await storage.listResultSheetEntries(sheet.id);
      res.status(201).json({ sheet, entries: createdEntries });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Update result sheet entries (draft only)
  app.put("/api/result-sheets/:id/entries", authenticate, authorize("teacher"), async (req: AuthRequest, res) => {
    try {
      const sheet = await storage.getResultSheet(req.params.id);
      if (!sheet) {
        return res.status(404).json({ message: "Result sheet not found" });
      }

      // Verify sheet belongs to user's school and user submitted it
      if (sheet.schoolId !== req.user!.schoolId) {
        return res.status(403).json({ message: "Cannot update result sheets from other schools" });
      }

      if (sheet.submittedBy !== req.user!.id) {
        return res.status(403).json({ message: "Can only update your own result sheets" });
      }

      if (sheet.status !== "draft" && sheet.status !== "rejected") {
        return res.status(400).json({ message: "Can only update draft or rejected result sheets" });
      }

      const { entries } = req.body;

      // Clear existing entries and create new ones
      await storage.deleteResultSheetEntriesBySheet(sheet.id);

      if (entries && entries.length > 0) {
        const entriesToCreate = entries.map((e: any) => {
          const ca1 = parseFloat(e.ca1) || 0;
          const ca2 = parseFloat(e.ca2) || 0;
          const exam = parseFloat(e.exam) || 0;
          const total = ca1 + ca2 + exam;
          const grade = calculateGrade(total);
          const remark = getGradeRemarkFromTotal(total);

          return {
            sheetId: sheet.id,
            studentId: e.studentId,
            ca1: String(ca1),
            ca2: String(ca2),
            exam: String(exam),
            total: String(total),
            grade,
            remark,
          };
        });

        await storage.createResultSheetEntries(entriesToCreate);
      }

      // Reset to draft if it was rejected
      if (sheet.status === "rejected") {
        await storage.updateResultSheet(sheet.id, { status: "draft" } as any);
      }

      const updatedEntries = await storage.listResultSheetEntries(sheet.id);
      res.json({ sheet, entries: updatedEntries });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Submit result sheet for approval
  app.patch("/api/result-sheets/:id/submit", authenticate, authorize("teacher"), async (req: AuthRequest, res) => {
    try {
      const sheet = await storage.getResultSheet(req.params.id);
      if (!sheet) {
        return res.status(404).json({ message: "Result sheet not found" });
      }

      if (sheet.schoolId !== req.user!.schoolId) {
        return res.status(403).json({ message: "Cannot submit result sheets from other schools" });
      }

      if (sheet.submittedBy !== req.user!.id) {
        return res.status(403).json({ message: "Can only submit your own result sheets" });
      }

      if (sheet.status !== "draft" && sheet.status !== "rejected") {
        return res.status(400).json({ message: "Can only submit draft or rejected result sheets" });
      }

      // Verify sheet has entries
      const entries = await storage.listResultSheetEntries(sheet.id);
      if (entries.length === 0) {
        return res.status(400).json({ message: "Cannot submit empty result sheet" });
      }

      const updatedSheet = await storage.submitResultSheet(sheet.id, req.user!.id);

      // Notify school admins
      const school = await storage.getSchool(req.user!.schoolId!);
      const allUsers = await storage.listUsers(req.user!.schoolId!);
      const schoolAdmins = allUsers.filter(u => u.role === "school_admin");

      const classRecord = await storage.getClass(sheet.classId);
      const subject = await storage.getSubject(sheet.subjectId);

      for (const admin of schoolAdmins) {
        await storage.createNotification({
          userId: admin.id,
          type: "result_sheet_submitted",
          title: "New Result Sheet Submitted",
          message: `A result sheet for ${classRecord?.name || "Unknown Class"} - ${subject?.name || "Unknown Subject"} has been submitted for review`,
          data: { sheetId: sheet.id },
        });
      }

      res.json(updatedSheet);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Approve result sheet (school admin)
  app.patch("/api/result-sheets/:id/approve", authenticate, authorize("school_admin"), async (req: AuthRequest, res) => {
    try {
      const sheet = await storage.getResultSheet(req.params.id);
      if (!sheet) {
        return res.status(404).json({ message: "Result sheet not found" });
      }

      if (sheet.schoolId !== req.user!.schoolId) {
        return res.status(403).json({ message: "Cannot approve result sheets from other schools" });
      }

      if (sheet.status !== "submitted") {
        return res.status(400).json({ message: "Can only approve submitted result sheets" });
      }

      // Check if school has a logo
      const school = await storage.getSchool(req.user!.schoolId!);
      if (!school?.logo) {
        return res.status(400).json({
          message: "Please upload your school logo in Profile Settings before approving results"
        });
      }

      const updatedSheet = await storage.approveResultSheet(sheet.id, req.user!.id);

      // Create audit log
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "approve_result_sheet",
        resource: "result_sheet",
        resourceId: sheet.id,
        details: { classId: sheet.classId, subjectId: sheet.subjectId, session: sheet.session, term: sheet.term },
      });

      // Merge this sheet's subjects into student results (incremental merge)
      await storage.mergeSheetIntoStudentResults(sheet.id);

      // Automatically calculate positions for this session/term/class after merging
      try {
        const school = await storage.getSchool(req.user!.schoolId!);
        const computationMode = school?.computationMode || 'total_average_only';
        
        // Only calculate positions if computation mode includes positions
        if (computationMode !== 'total_average_only') {
          const classRecord = await storage.getClass(sheet.classId);
          await storage.calculateAndUpdatePositions(
            req.user!.schoolId!,
            sheet.session,
            sheet.term,
            classRecord?.name || sheet.classId
          );
        }
      } catch (posError) {
        // Log error but don't fail the approval
        console.error("Error calculating positions:", posError);
      }

      // Notify the teacher
      await storage.createNotification({
        userId: sheet.submittedBy,
        type: "result_sheet_approved",
        title: "Result Sheet Approved",
        message: `Your result sheet has been approved`,
        data: { sheetId: sheet.id },
      });

      res.json(updatedSheet);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Re-aggregate all result sheets for a session/term (school admin)
  // This fixes data where sheets were approved before the incremental merge was implemented
  app.post("/api/results/reaggregate", authenticate, authorize("school_admin"), async (req: AuthRequest, res) => {
    try {
      const { session, term } = req.body;
      if (!session || !term) {
        return res.status(400).json({ message: "Session and term are required" });
      }

      const schoolId = req.user!.schoolId!;

      // Use storage method to safely re-aggregate
      const sheetsProcessed = await storage.reaggregateResults(schoolId, session, term);

      if (sheetsProcessed === 0) {
        return res.status(400).json({ message: "No approved or published sheets found for this session/term" });
      }

      // Create audit log
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "reaggregate_results",
        resource: "results",
        resourceId: schoolId,
        details: { session, term, sheetsProcessed },
      });

      res.json({
        message: `Successfully re-aggregated ${sheetsProcessed} result sheets`,
        sheetsProcessed
      });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Reject result sheet (school admin)
  app.patch("/api/result-sheets/:id/reject", authenticate, authorize("school_admin"), async (req: AuthRequest, res) => {
    try {
      const sheet = await storage.getResultSheet(req.params.id);
      if (!sheet) {
        return res.status(404).json({ message: "Result sheet not found" });
      }

      if (sheet.schoolId !== req.user!.schoolId) {
        return res.status(403).json({ message: "Cannot reject result sheets from other schools" });
      }

      if (sheet.status !== "submitted") {
        return res.status(400).json({ message: "Can only reject submitted result sheets" });
      }

      const { reason } = req.body;
      if (!reason) {
        return res.status(400).json({ message: "Rejection reason is required" });
      }

      const updatedSheet = await storage.rejectResultSheet(sheet.id, req.user!.id, reason);

      // Create audit log
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "reject_result_sheet",
        resource: "result_sheet",
        resourceId: sheet.id,
        details: { classId: sheet.classId, subjectId: sheet.subjectId, reason },
      });

      // Notify the teacher
      await storage.createNotification({
        userId: sheet.submittedBy,
        type: "result_sheet_rejected",
        title: "Result Sheet Rejected",
        message: `Your result sheet has been rejected. Reason: ${reason}`,
        data: { sheetId: sheet.id, reason },
      });

      res.json(updatedSheet);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Delete result sheet (teacher can delete own drafts)
  app.delete("/api/result-sheets/:id", authenticate, authorize("teacher", "school_admin"), async (req: AuthRequest, res) => {
    try {
      const sheet = await storage.getResultSheet(req.params.id);
      if (!sheet) {
        return res.status(404).json({ message: "Result sheet not found" });
      }

      if (sheet.schoolId !== req.user!.schoolId) {
        return res.status(403).json({ message: "Cannot delete result sheets from other schools" });
      }

      // Teachers can only delete their own drafts
      if (req.user!.role === "teacher") {
        if (sheet.submittedBy !== req.user!.id) {
          return res.status(403).json({ message: "Can only delete your own result sheets" });
        }
        if (sheet.status !== "draft") {
          return res.status(400).json({ message: "Can only delete draft result sheets" });
        }
      }

      // School admins cannot delete published sheets
      if (sheet.status === "published") {
        return res.status(400).json({ message: "Cannot delete published result sheets" });
      }

      await storage.deleteResultSheet(sheet.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Bulk actions for result sheets (delete/archive)
  app.post("/api/result-sheets/bulk-action", authenticate, authorize("school_admin", "super_admin"), async (req: AuthRequest, res) => {
    try {
      const { ids, action } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "No result sheets selected" });
      }

      if (!["delete", "archive"].includes(action)) {
        return res.status(400).json({ message: "Invalid action. Use 'delete' or 'archive'" });
      }

      // Get schoolId - for super_admin, we need to verify from the first sheet
      let schoolId = req.user!.schoolId;

      // Verify all sheets belong to user's school
      for (const id of ids) {
        const sheet = await storage.getResultSheet(id);
        if (!sheet) {
          return res.status(404).json({ message: `Result sheet ${id} not found` });
        }
        if (req.user!.role === "super_admin") {
          // For super admin, use the schoolId from the first sheet
          if (!schoolId) schoolId = sheet.schoolId;
        } else if (sheet.schoolId !== req.user!.schoolId) {
          return res.status(403).json({ message: "Cannot modify result sheets from other schools" });
        }
      }

      if (!schoolId) {
        return res.status(400).json({ message: "School ID required" });
      }

      if (action === "delete") {
        await storage.deleteResultSheets(ids, schoolId);
      } else {
        await storage.archiveResultSheets(ids, schoolId, req.user!.id);
      }

      // Create audit log
      await storage.createAuditLog({
        userId: req.user!.id,
        action: `bulk_${action}_result_sheets`,
        resource: "result_sheet",
        details: { ids, count: ids.length },
      });

      res.json({ message: `Successfully ${action}d ${ids.length} result sheet(s)` });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ===== PINS ROUTES =====
  app.get("/api/pins", authenticate, async (req: AuthRequest, res) => {
    try {
      if (!req.user!.schoolId && req.user!.role !== "super_admin") {
        return res.status(403).json({ message: "School association required" });
      }

      const schoolId = req.user!.role === "super_admin"
        ? req.query.schoolId as string
        : req.user!.schoolId!;

      if (!schoolId) {
        return res.status(400).json({ message: "School ID required" });
      }

      const pins = await storage.listPins(schoolId);
      res.json(pins);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/pins", authenticate, authorize("super_admin", "school_admin"), async (req: AuthRequest, res) => {
    try {
      const { quantity, session, term, schoolId, maxUsageCount = 1, expiryDate } = req.body;
      const targetSchoolId = req.user!.role === "super_admin" ? schoolId : req.user!.schoolId!;

      if (!targetSchoolId) {
        return res.status(400).json({ message: "School ID is required" });
      }

      const pinQuantity = Math.max(1, Math.min(1000, parseInt(quantity) || 0));
      if (!pinQuantity) {
        return res.status(400).json({ message: "A valid quantity is required" });
      }

      if (!session || !term) {
        return res.status(400).json({ message: "Session and term are required" });
      }

      // Validate maxUsageCount
      const usageLimit = Math.max(1, Math.min(100, parseInt(maxUsageCount) || 1));

      const pinsToCreate = [];
      const resolvedExpiryDate = expiryDate ? new Date(expiryDate) : new Date();
      if (Number.isNaN(resolvedExpiryDate.getTime())) {
        return res.status(400).json({ message: "Invalid expiry date" });
      }

      if (!expiryDate) {
        resolvedExpiryDate.setMonth(resolvedExpiryDate.getMonth() + 6); // 6 months expiry
      }

      for (let i = 0; i < pinQuantity; i++) {
        pinsToCreate.push({
          schoolId: targetSchoolId,
          pin: generatePIN(),
          session,
          term,
          expiryDate: resolvedExpiryDate,
          maxUsageCount: usageLimit,
          generatedBy: req.user!.id,
        });
      }

      const pins = await storage.createPins(pinsToCreate);
      res.status(201).json(pins);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Get single PIN by ID
  app.get("/api/pins/:id", authenticate, async (req: AuthRequest, res) => {
    try {
      const pin = await storage.getPinById(req.params.id);
      if (!pin) {
        return res.status(404).json({ message: "PIN not found" });
      }

      // Verify PIN belongs to user's school (except super admin)
      if (req.user!.role !== "super_admin" && pin.schoolId !== req.user!.schoolId) {
        return res.status(403).json({ message: "Cannot access PINs from other schools" });
      }

      res.json(pin);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/pins/:id", authenticate, authorize("super_admin", "school_admin"), async (req: AuthRequest, res) => {
    try {
      const existing = await storage.getPinById(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "PIN not found" });
      }

      // Verify PIN belongs to user's school (except super admin)
      if (req.user!.role !== "super_admin" && existing.schoolId !== req.user!.schoolId) {
        return res.status(403).json({ message: "Cannot delete PINs from other schools" });
      }

      await storage.deletePin(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ===== PIN REQUESTS ROUTES =====
  app.get("/api/pin-requests", authenticate, async (req: AuthRequest, res) => {
    try {
      const schoolId = req.user!.role === "super_admin" ? undefined : req.user!.schoolId;
      const requests = await storage.listPinRequests(schoolId);
      res.json(requests);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/pin-requests", authenticate, authorize("school_admin"), async (req: AuthRequest, res) => {
    try {
      const validated = insertPinRequestSchema.parse(req.body);
      const request = await storage.createPinRequest({
        ...validated,
        schoolId: req.user!.schoolId!,
        requestedBy: req.user!.id,
      });

      // Notify all super admins about the new PIN request
      const school = await storage.getSchool(req.user!.schoolId!);
      const allUsers = await storage.listUsers();
      const superAdmins = allUsers.filter(u => u.role === "super_admin");

      for (const admin of superAdmins) {
        await storage.createNotification({
          userId: admin.id,
          type: "pin_request",
          title: "New PIN Request",
          message: `${school?.name || 'A school'} has requested ${validated.quantity} PINs for ${validated.session} ${validated.term} Term.`,
          data: { requestId: request.id, schoolId: req.user!.schoolId },
        });
      }

      res.status(201).json(request);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ===== ANALYTICS ROUTES =====
  app.get("/api/analytics/dashboard", authenticate, async (req: AuthRequest, res) => {
    try {
      const stats = await storage.getDashboardStats(
        req.user!.id,
        req.user!.role,
        req.user!.schoolId
      );
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ===== POSITION CALCULATION ROUTES =====
  app.post("/api/results/calculate-positions", authenticate, authorize("school_admin"), async (req: AuthRequest, res) => {
    try {
      const schoolId = req.user!.schoolId;
      if (!schoolId) {
        return res.status(403).json({ message: "School association required" });
      }

      const { session, term, classId } = req.body;

      if (!session || !term) {
        return res.status(400).json({ message: "Session and term are required" });
      }

      // Check school's computation mode
      const school = await storage.getSchool(schoolId);
      const computationMode = school?.computationMode || 'total_average_only';

      // Only calculate positions if computation mode includes positions
      if (computationMode === 'total_average_only') {
        return res.status(400).json({
          message: "Position calculation is disabled. Update computation mode to include positions."
        });
      }

      const updatedCount = await storage.calculateAndUpdatePositions(schoolId, session, term, classId);

      res.json({
        message: `Positions calculated for ${updatedCount} results`,
        updatedCount
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ===== USERS ROUTES =====
  app.get("/api/users", authenticate, authorize("super_admin", "school_admin"), async (req: AuthRequest, res) => {
    try {
      const schoolId = req.user!.role === "super_admin" ? undefined : req.user!.schoolId;
      const users = await storage.listUsers(schoolId);
      const usersWithoutPasswords = users.map(({ password, ...user }) => user);
      res.json(usersWithoutPasswords);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/users/:id", authenticate, authorize("super_admin", "school_admin"), async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // School admins can only update users from their school
      if (req.user!.role === "school_admin" && user.schoolId !== req.user!.schoolId) {
        return res.status(403).json({ message: "Cannot update users from other schools" });
      }

      const updated = await storage.updateUser(req.params.id, req.body);
      const { password, ...userWithoutPassword } = updated;
      res.json(userWithoutPassword);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Password change endpoint - allows users to change their own password
  app.patch("/api/users/:id/password", authenticate, async (req: AuthRequest, res) => {
    try {
      const { currentPassword, newPassword } = req.body;

      // Users can only change their own password
      if (req.params.id !== req.user!.id) {
        return res.status(403).json({ message: "You can only change your own password" });
      }

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current and new password are required" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ message: "New password must be at least 6 characters" });
      }

      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(currentPassword, user.password);
      if (!isValidPassword) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      // Hash new password and update
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUser(req.params.id, { password: hashedPassword });

      res.json({ message: "Password updated successfully" });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ===== CLASSES ROUTES =====
  app.get("/api/classes", authenticate, async (req: AuthRequest, res) => {
    try {
      const schoolId = req.user!.role === "super_admin"
        ? req.query.schoolId as string
        : req.user!.schoolId!;
      const classes = await storage.listClasses(schoolId);
      res.json(classes);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/classes", authenticate, authorize("school_admin"), async (req: AuthRequest, res) => {
    try {
      const classRecord = await storage.createClass({
        ...req.body,
        schoolId: req.user!.schoolId!,
        createdBy: req.user!.id,
      });
      res.status(201).json(classRecord);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Get single class by ID
  app.get("/api/classes/:id", authenticate, async (req: AuthRequest, res) => {
    try {
      const classRecord = await storage.getClass(req.params.id);
      if (!classRecord) {
        return res.status(404).json({ message: "Class not found" });
      }

      // Verify class belongs to user's school (except super admin)
      if (req.user!.role !== "super_admin" && classRecord.schoolId !== req.user!.schoolId) {
        return res.status(403).json({ message: "Cannot access classes from other schools" });
      }

      res.json(classRecord);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/classes/:id", authenticate, authorize("school_admin"), async (req: AuthRequest, res) => {
    try {
      const classRecord = await storage.getClass(req.params.id);
      if (!classRecord) {
        return res.status(404).json({ message: "Class not found" });
      }
      if (classRecord.schoolId !== req.user!.schoolId) {
        return res.status(403).json({ message: "Cannot update classes from other schools" });
      }
      const updated = await storage.updateClass(req.params.id, req.body);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/classes/:id", authenticate, authorize("school_admin", "super_admin"), async (req: AuthRequest, res) => {
    try {
      // Verify class belongs to user's school for school admins
      const classRecord = await storage.getClass(req.params.id);
      if (!classRecord) {
        return res.status(404).json({ message: "Class not found" });
      }

      if (req.user!.role === "school_admin" && classRecord.schoolId !== req.user!.schoolId) {
        return res.status(403).json({ message: "Cannot delete classes from other schools" });
      }

      // Use schoolId-scoped delete for extra security
      const schoolIdToCheck = req.user!.role === "school_admin" ? req.user!.schoolId : undefined;
      await storage.deleteClass(req.params.id, schoolIdToCheck);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ===== SUBJECTS ROUTES =====
  app.get("/api/subjects", authenticate, async (req: AuthRequest, res) => {
    try {
      const schoolId = req.user!.role === "super_admin"
        ? req.query.schoolId as string
        : req.user!.schoolId!;
      const subjects = await storage.listSubjects(schoolId);
      res.json(subjects);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/subjects", authenticate, authorize("school_admin"), async (req: AuthRequest, res) => {
    try {
      const subject = await storage.createSubject({
        ...req.body,
        schoolId: req.user!.schoolId!,
        createdBy: req.user!.id,
      });
      res.status(201).json(subject);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Get single subject by ID
  app.get("/api/subjects/:id", authenticate, async (req: AuthRequest, res) => {
    try {
      const subject = await storage.getSubject(req.params.id);
      if (!subject) {
        return res.status(404).json({ message: "Subject not found" });
      }

      // Verify subject belongs to user's school (except super admin)
      if (req.user!.role !== "super_admin" && subject.schoolId !== req.user!.schoolId) {
        return res.status(403).json({ message: "Cannot access subjects from other schools" });
      }

      res.json(subject);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/subjects/:id", authenticate, authorize("school_admin"), async (req: AuthRequest, res) => {
    try {
      const subject = await storage.getSubject(req.params.id);
      if (!subject) {
        return res.status(404).json({ message: "Subject not found" });
      }
      if (subject.schoolId !== req.user!.schoolId) {
        return res.status(403).json({ message: "Cannot update subjects from other schools" });
      }
      const updated = await storage.updateSubject(req.params.id, req.body);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/subjects/:id", authenticate, authorize("school_admin", "super_admin"), async (req: AuthRequest, res) => {
    try {
      // Verify subject belongs to user's school for school admins
      const subject = await storage.getSubject(req.params.id);
      if (!subject) {
        return res.status(404).json({ message: "Subject not found" });
      }

      if (req.user!.role === "school_admin" && subject.schoolId !== req.user!.schoolId) {
        return res.status(403).json({ message: "Cannot delete subjects from other schools" });
      }

      // Use schoolId-scoped delete for extra security
      const schoolIdToCheck = req.user!.role === "school_admin" ? req.user!.schoolId : undefined;
      await storage.deleteSubject(req.params.id, schoolIdToCheck);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ===== PIN REQUEST APPROVAL ROUTES =====
  app.post("/api/pin-requests/:id/approve", authenticate, authorize("super_admin"), async (req: AuthRequest, res) => {
    try {
      const request = await storage.getPinRequest(req.params.id);
      if (!request) {
        return res.status(404).json({ message: "PIN request not found" });
      }

      if (request.status !== "pending") {
        return res.status(400).json({ message: "Request has already been processed" });
      }

      // Get maxUsageCount from request body, default to 1
      const { maxUsageCount = 1 } = req.body;
      const usageLimit = Math.max(1, Math.min(100, parseInt(maxUsageCount) || 1));

      // Generate PINs for the approved request
      const pinsToCreate = [];
      const expiryDate = new Date();
      expiryDate.setMonth(expiryDate.getMonth() + 6);

      for (let i = 0; i < request.quantity; i++) {
        pinsToCreate.push({
          schoolId: request.schoolId,
          pin: generatePIN(),
          session: request.session,
          term: request.term,
          expiryDate,
          maxUsageCount: usageLimit,
          generatedBy: req.user!.id,
        });
      }

      const pins = await storage.createPins(pinsToCreate);

      // Update request status
      const updated = await storage.updatePinRequest(req.params.id, {
        status: "approved",
        processedBy: req.user!.id,
        processedAt: new Date(),
        generatedPinIds: pins.map(p => p.id),
      });

      // Notify the requester
      await storage.createNotification({
        userId: request.requestedBy,
        type: "pin_request_approved",
        title: "PIN Request Approved",
        message: `Your request for ${request.quantity} PINs for ${request.session} ${request.term} Term has been approved.`,
        data: { requestId: request.id, quantity: request.quantity },
      });

      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/pin-requests/:id/reject", authenticate, authorize("super_admin"), async (req: AuthRequest, res) => {
    try {
      const request = await storage.getPinRequest(req.params.id);
      if (!request) {
        return res.status(404).json({ message: "PIN request not found" });
      }

      if (request.status !== "pending") {
        return res.status(400).json({ message: "Request has already been processed" });
      }

      const updated = await storage.updatePinRequest(req.params.id, {
        status: "rejected",
        processedBy: req.user!.id,
        processedAt: new Date(),
        rejectionReason: req.body.reason,
      });

      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ===== PUBLIC ROUTES =====

  // Public result checking with PIN
  app.post("/api/public/check-result", async (req, res) => {
    try {
      const { pin, admissionNumber, session, term } = req.body;

      if (!pin || !admissionNumber) {
        return res.status(400).json({ message: "PIN and registration number are required" });
      }

      if (!session || !term) {
        return res.status(400).json({ message: "Academic year and term are required" });
      }

      // Find the PIN
      const pinRecord = await storage.getPin(pin.toUpperCase());
      if (!pinRecord) {
        return res.status(404).json({ message: "Invalid PIN" });
      }

      // Validate session and term match the PIN
      if (pinRecord.session !== session || pinRecord.term !== term) {
        return res.status(400).json({
          message: `This PIN is only valid for ${pinRecord.session} ${pinRecord.term} Term`
        });
      }

      // Check if PIN is expired
      if (pinRecord.expiryDate && new Date(pinRecord.expiryDate) < new Date()) {
        return res.status(400).json({ message: "This PIN has expired" });
      }

      const usageCount = pinRecord.usageCount || 0;
      const maxUsageCount = pinRecord.maxUsageCount || 1;
      if (usageCount >= maxUsageCount) {
        return res.status(400).json({ message: "This PIN has reached its maximum usage limit" });
      }

      // Check if PIN has reached max failed attempts
      const attempts = Array.isArray(pinRecord.attempts) ? pinRecord.attempts : [];
      const failedAttempts = attempts.filter((attempt: any) => attempt?.type === "failed").length;
      if (pinRecord.maxAttempts && failedAttempts >= pinRecord.maxAttempts) {
        return res.status(400).json({ message: "This PIN has reached its maximum failed attempts" });
      }

      // Find the student
      const student = await storage.getStudentByAdmissionNumber(
        admissionNumber.toUpperCase(),
        pinRecord.schoolId
      );

      if (!student) {
        // Log failed attempt
        const currentAttempts = Array.isArray(pinRecord.attempts) ? pinRecord.attempts : [];
        await storage.updatePin(pinRecord.id, {
          attempts: [...currentAttempts, { type: "failed", admissionNumber, timestamp: new Date().toISOString() }]
        });
        return res.status(404).json({ message: "Student not found with this registration number" });
      }

      // Find the result for this student, session, and term
      const result = await storage.getResultByStudentSessionTerm(
        student.id,
        session,
        term
      );

      if (!result) {
        return res.status(404).json({
          message: `No result found for ${pinRecord.session} ${pinRecord.term} Term`
        });
      }

      // Check if result is approved or published
      if (result.status !== "approved" && result.status !== "published") {
        return res.status(400).json({ message: "This result has not been approved yet" });
      }

      // Get school info
      const school = await storage.getSchool(pinRecord.schoolId);

      // Update PIN usage
      const currentAttempts = Array.isArray(pinRecord.attempts) ? pinRecord.attempts : [];
      const nextUsageCount = usageCount + 1;
      await storage.updatePin(pinRecord.id, {
        isUsed: nextUsageCount >= maxUsageCount,
        usageCount: nextUsageCount,
        attempts: [...currentAttempts, { type: "success", admissionNumber: student.admissionNumber, studentId: student.id, timestamp: new Date().toISOString() }],
        usedBy: { admissionNumber: student.admissionNumber, studentName: `${student.firstName} ${student.lastName}`, usedAt: new Date().toISOString() },
      });

      // Return the result data
      res.json({
        student: {
          firstName: student.firstName,
          lastName: student.lastName,
          admissionNumber: student.admissionNumber,
          class: student.class,
        },
        school: {
          name: school?.name || "Unknown School",
          logo: school?.logo,
          motto: school?.motto,
        },
        session: result.session,
        term: result.term,
        subjects: result.subjects,
        totalScore: result.totalScore,
        averageScore: result.averageScore,
        position: result.position,
        totalStudents: result.totalStudents,
        teacherComment: result.teacherComment,
        principalComment: result.principalComment,
        attendance: result.attendance,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Public school registration (for school admins to register themselves)
  const publicRegisterSchema = z.object({
    schoolName: z.string().min(1, "School name is required"),
    schoolCode: z.string().min(1, "School code is required").toUpperCase(),
    schoolEmail: z.string().email("Valid email required"),
    schoolPhone: z.string().optional(),
    schoolAddress: z.string().optional(),
    adminFirstName: z.string().min(1, "First name is required"),
    adminLastName: z.string().min(1, "Last name is required"),
    adminEmail: z.string().email("Valid email required"),
    adminPassword: z.string().min(6, "Password must be at least 6 characters"),
    logo: z.string().optional(),
  });

  app.post("/api/public/register-school", async (req, res) => {
    try {
      const validated = publicRegisterSchema.parse(req.body);

      // Check if school code already exists
      const existingSchool = await storage.getSchoolByCode(validated.schoolCode);
      if (existingSchool) {
        return res.status(400).json({ message: "School code already exists" });
      }

      // Check if admin email already exists
      const existingUser = await storage.getUserByEmail(validated.adminEmail);
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      // Create the school (pending approval)
      const school = await storage.createSchool({
        name: validated.schoolName,
        code: validated.schoolCode,
        email: validated.schoolEmail,
        phone: validated.schoolPhone ?? "",
        address: validated.schoolAddress ?? "",
        logo: validated.logo,
        isActive: false, // Requires super admin approval
      });

      // Hash password and create admin user
      const hashedPassword = await bcrypt.hash(validated.adminPassword, 10);
      const user = await storage.createUser({
        email: validated.adminEmail,
        password: hashedPassword,
        firstName: validated.adminFirstName,
        lastName: validated.adminLastName,
        role: "school_admin",
        schoolId: school.id,
        isActive: false, // Requires super admin approval
      });

      const { password: _, ...userWithoutPassword } = user;

      res.status(201).json({
        message: "Registration successful! Your account is pending approval.",
        school: { id: school.id, name: school.name, code: school.code },
        user: userWithoutPassword,
      });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: error.errors[0]?.message || "Validation failed" });
      }
      res.status(500).json({ message: error.message });
    }
  });

  // ===== BULK UPLOAD ROUTES =====

  // Bulk upload students
  app.post("/api/students/bulk", authenticate, authorize("school_admin", "teacher"), async (req: AuthRequest, res) => {
    try {
      const { students: studentData } = req.body;

      if (!Array.isArray(studentData) || studentData.length === 0) {
        return res.status(400).json({ message: "No student data provided" });
      }

      const schoolId = req.user!.schoolId;
      if (!schoolId) {
        return res.status(403).json({ message: "School association required" });
      }

      const results = {
        success: 0,
        failed: 0,
        errors: [] as string[],
      };

      const validStudents = [];

      for (let i = 0; i < studentData.length; i++) {
        const row = studentData[i];
        try {
          // Check for required fields
          if (!row.admissionNumber || !row.firstName || !row.lastName || !row.gender || !row.class) {
            results.errors.push(`Row ${i + 1}: Missing required fields`);
            results.failed++;
            continue;
          }

          // Check for duplicate admission number
          const existing = await storage.getStudentByAdmissionNumber(
            row.admissionNumber.toUpperCase(),
            schoolId
          );

          if (existing) {
            results.errors.push(`Row ${i + 1}: Admission number ${row.admissionNumber} already exists`);
            results.failed++;
            continue;
          }

          validStudents.push({
            schoolId,
            admissionNumber: row.admissionNumber.toUpperCase(),
            firstName: row.firstName,
            lastName: row.lastName,
            otherNames: row.otherNames || row.middleName || null,
            gender: row.gender,
            class: row.class,
            classArm: row.classArm || null,
            createdBy: req.user!.id,
          });

        } catch (err: any) {
          results.errors.push(`Row ${i + 1}: ${err.message}`);
          results.failed++;
        }
      }

      // Bulk insert valid students
      if (validStudents.length > 0) {
        await storage.createStudents(validStudents);
        results.success = validStudents.length;
      }

      res.json({
        message: `Uploaded ${results.success} students successfully`,
        ...results,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Bulk upload results
  app.post("/api/results/bulk", authenticate, authorize("school_admin", "teacher"), async (req: AuthRequest, res) => {
    try {
      const { results: resultData, session, term } = req.body;

      if (!Array.isArray(resultData) || resultData.length === 0) {
        return res.status(400).json({ message: "No result data provided" });
      }

      if (!session || !term) {
        return res.status(400).json({ message: "Session and term are required" });
      }

      const schoolId = req.user!.schoolId;
      if (!schoolId) {
        return res.status(403).json({ message: "School association required" });
      }

      // Get school's grade configuration
      const gradeRanges = await getSchoolGradeRanges(schoolId);

      const uploadResults = {
        success: 0,
        failed: 0,
        errors: [] as string[],
      };

      const validResults = [];

      for (let i = 0; i < resultData.length; i++) {
        const row = resultData[i];
        try {
          // Find student by admission number
          if (!row.admissionNumber) {
            uploadResults.errors.push(`Row ${i + 1}: Missing admission number`);
            uploadResults.failed++;
            continue;
          }

          const student = await storage.getStudentByAdmissionNumber(
            row.admissionNumber.toUpperCase(),
            schoolId
          );

          if (!student) {
            uploadResults.errors.push(`Row ${i + 1}: Student ${row.admissionNumber} not found`);
            uploadResults.failed++;
            continue;
          }

          // Check if result already exists for this student/session/term
          const existingResult = await storage.getResultByStudentSessionTerm(student.id, session, term);
          if (existingResult) {
            uploadResults.errors.push(`Row ${i + 1}: Result already exists for ${row.admissionNumber}`);
            uploadResults.failed++;
            continue;
          }

          // Process subjects - calculate totals and grades using school config
          const subjectsInput = row.subjects?.map((subj: any) => ({
            subject: subj.subject,
            ca1: Number(subj.ca1) || 0,
            ca2: Number(subj.ca2) || 0,
            exam: Number(subj.exam) || 0,
          })) || [];

          const calculated = calculateResults(subjectsInput, gradeRanges);
          const subjects = calculated.subjects;

          const totalScore = subjects.reduce((sum: number, s: any) => sum + s.total, 0);
          const averageScore = subjects.length > 0 ? totalScore / subjects.length : 0;

          validResults.push({
            schoolId,
            studentId: student.id,
            session,
            term,
            class: student.class,
            subjects,
            totalScore: totalScore.toFixed(2),
            averageScore: averageScore.toFixed(2),
            status: "draft",
            uploadedBy: req.user!.id,
          });

        } catch (err: any) {
          uploadResults.errors.push(`Row ${i + 1}: ${err.message}`);
          uploadResults.failed++;
        }
      }

      // Bulk insert valid results
      if (validResults.length > 0) {
        await storage.createResults(validResults);
        uploadResults.success = validResults.length;
      }

      res.json({
        message: `Uploaded ${uploadResults.success} results successfully`,
        ...uploadResults,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get single result by ID - MUST come after all specific routes (/bulk-action, /reaggregate, /calculate-positions, /bulk)
  app.get("/api/results/:id", authenticate, async (req: AuthRequest, res) => {
    try {
      const result = await storage.getResult(req.params.id);
      if (!result) {
        return res.status(404).json({ message: "Result not found" });
      }

      // Verify result belongs to user's school (except super admin)
      if (req.user!.role !== "super_admin" && result.schoolId !== req.user!.schoolId) {
        return res.status(403).json({ message: "Cannot access results from other schools" });
      }

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ===== SCORE METRICS ROUTES =====
  app.get("/api/score-metrics", authenticate, async (req: AuthRequest, res) => {
    try {
      const schoolId = req.user!.schoolId;
      if (!schoolId) {
        return res.status(403).json({ message: "School association required" });
      }
      const metrics = await storage.listScoreMetrics(schoolId);
      res.json(metrics);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/score-metrics", authenticate, authorize("school_admin"), async (req: AuthRequest, res) => {
    try {
      const schoolId = req.user!.schoolId;
      if (!schoolId) {
        return res.status(403).json({ message: "School association required" });
      }

      const { name, maxScore, order } = req.body;

      const metric = await storage.createScoreMetric({
        schoolId,
        name,
        maxScore: Number(maxScore),
        order: Number(order || 0),
        createdBy: req.user!.id,
      });

      res.status(201).json(metric);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Bulk update score metrics order - MUST come before /:id route to avoid conflicts
  app.put("/api/score-metrics/order", authenticate, authorize("school_admin"), async (req: AuthRequest, res) => {
    try {
      const { metrics } = req.body; // Array of {id, order}
      if (!Array.isArray(metrics)) {
        return res.status(400).json({ message: "Invalid metrics array" });
      }

      for (const m of metrics) {
        const metric = await storage.getScoreMetric(m.id);
        if (metric && metric.schoolId === req.user!.schoolId) {
          await storage.updateScoreMetric(m.id, { order: m.order });
        }
      }

      const updated = await storage.listScoreMetrics(req.user!.schoolId!);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/score-metrics/:id", authenticate, authorize("school_admin"), async (req: AuthRequest, res) => {
    try {
      const metric = await storage.getScoreMetric(req.params.id);
      if (!metric) {
        return res.status(404).json({ message: "Score metric not found" });
      }
      if (metric.schoolId !== req.user!.schoolId) {
        return res.status(403).json({ message: "Cannot update metrics from other schools" });
      }

      const updated = await storage.updateScoreMetric(req.params.id, req.body);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/score-metrics/:id", authenticate, authorize("school_admin"), async (req: AuthRequest, res) => {
    try {
      const metric = await storage.getScoreMetric(req.params.id);
      if (!metric) {
        return res.status(404).json({ message: "Score metric not found" });
      }
      if (metric.schoolId !== req.user!.schoolId) {
        return res.status(403).json({ message: "Cannot delete metrics from other schools" });
      }

      await storage.deleteScoreMetric(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ===== CLASS SUBJECTS ROUTES =====
  app.get("/api/classes/:classId/subjects", authenticate, async (req: AuthRequest, res) => {
    try {
      // Verify class belongs to user's school (except super admin)
      const classRecord = await storage.getClass(req.params.classId);
      if (!classRecord) {
        return res.status(404).json({ message: "Class not found" });
      }

      if (req.user!.role !== "super_admin" && classRecord.schoolId !== req.user!.schoolId) {
        return res.status(403).json({ message: "Cannot access class subjects from other schools" });
      }

      const classSubjectsList = await storage.getClassSubjects(req.params.classId);
      res.json(classSubjectsList);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/classes/:classId/subjects", authenticate, authorize("school_admin"), async (req: AuthRequest, res) => {
    try {
      const schoolId = req.user!.schoolId;
      if (!schoolId) {
        return res.status(403).json({ message: "School association required" });
      }

      const { subjectIds } = req.body;
      if (!Array.isArray(subjectIds)) {
        return res.status(400).json({ message: "Invalid subjectIds array" });
      }

      const result = await storage.setClassSubjects(schoolId, req.params.classId, subjectIds);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ===== NOTIFICATIONS ROUTES =====
  app.get("/api/notifications", authenticate, async (req: AuthRequest, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const notificationsList = await storage.listNotifications(req.user!.id, limit);
      res.json(notificationsList);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/notifications/unread-count", authenticate, async (req: AuthRequest, res) => {
    try {
      const count = await storage.countUnreadNotifications(req.user!.id);
      res.json({ count });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/notifications/:id/read", authenticate, async (req: AuthRequest, res) => {
    try {
      // Verify notification belongs to user
      const notification = await storage.getNotification(req.params.id);
      if (notification && notification.userId !== req.user!.id) {
        return res.status(403).json({ message: "Cannot mark notifications from other users as read" });
      }

      const updated = await storage.markNotificationRead(req.params.id);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/notifications/mark-all-read", authenticate, async (req: AuthRequest, res) => {
    try {
      await storage.markAllNotificationsRead(req.user!.id);
      res.json({ message: "All notifications marked as read" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ===== TEACHER ASSIGNMENTS ROUTES =====
  app.get("/api/teacher-assignments", authenticate, authorize("school_admin"), async (req: AuthRequest, res) => {
    try {
      const schoolId = req.user!.schoolId;
      if (!schoolId) {
        return res.status(403).json({ message: "School association required" });
      }

      // Get all teachers for this school with their assignments
      const teachers = await storage.listUsers(schoolId);
      const teachersList = teachers.filter(u => u.role === "teacher");

      const result = await Promise.all(teachersList.map(async (teacher) => {
        const assignments = await storage.getTeacherAssignments(teacher.id);
        return {
          teacher: {
            id: teacher.id,
            firstName: teacher.firstName,
            lastName: teacher.lastName,
            email: teacher.email,
          },
          assignments,
        };
      }));

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/teacher-assignments/:teacherId", authenticate, async (req: AuthRequest, res) => {
    try {
      // Verify teacher belongs to user's school (except super admin)
      const teacher = await storage.getUser(req.params.teacherId);
      if (!teacher) {
        return res.status(404).json({ message: "Teacher not found" });
      }

      if (req.user!.role !== "super_admin" && teacher.schoolId !== req.user!.schoolId) {
        return res.status(403).json({ message: "Cannot access teacher assignments from other schools" });
      }

      const assignments = await storage.getTeacherAssignments(req.params.teacherId);
      res.json(assignments);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/teacher-assignments/:teacherId", authenticate, authorize("school_admin"), async (req: AuthRequest, res) => {
    try {
      const schoolId = req.user!.schoolId;
      if (!schoolId) {
        return res.status(403).json({ message: "School association required" });
      }

      const { assignments } = req.body; // Array of {classId, subjectId}
      if (!Array.isArray(assignments)) {
        return res.status(400).json({ message: "Invalid assignments array" });
      }

      const result = await storage.setTeacherAssignments(schoolId, req.params.teacherId, assignments);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ===== RESULT WORKFLOW ROUTES =====

  // Submit result (moves from draft to submitted)
  app.post("/api/results/:id/submit", authenticate, authorize("school_admin", "teacher"), async (req: AuthRequest, res) => {
    try {
      const result = await storage.getResult(req.params.id);
      if (!result) {
        return res.status(404).json({ message: "Result not found" });
      }

      if (result.schoolId !== req.user!.schoolId) {
        return res.status(403).json({ message: "Cannot submit results from other schools" });
      }

      if (result.status !== "draft" && result.status !== "rejected") {
        return res.status(400).json({ message: "Only draft or rejected results can be submitted" });
      }

      const updated = await storage.updateResult(req.params.id, {
        status: "submitted",
        rejectionReason: null,
      });

      // Notify school admin about submitted result
      const schoolAdmins = await storage.listUsers(req.user!.schoolId!);
      for (const admin of schoolAdmins.filter(u => u.role === "school_admin")) {
        await storage.createNotification({
          userId: admin.id,
          type: "result_submitted",
          title: "Result Submitted for Review",
          message: `A new result has been submitted for review for ${result.session} ${result.term} Term.`,
          data: { resultId: result.id },
        });
      }

      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Approve result (moves from submitted to approved)
  app.post("/api/results/:id/approve", authenticate, authorize("school_admin"), async (req: AuthRequest, res) => {
    try {
      const result = await storage.getResult(req.params.id);
      if (!result) {
        return res.status(404).json({ message: "Result not found" });
      }

      if (result.schoolId !== req.user!.schoolId) {
        return res.status(403).json({ message: "Cannot approve results from other schools" });
      }

      // Check if school has logo
      const school = await storage.getSchool(req.user!.schoolId!);
      if (!school?.logo) {
        return res.status(400).json({ message: "School logo is required before approving results. Please upload a logo in school settings." });
      }

      if (result.status !== "submitted") {
        return res.status(400).json({ message: "Only submitted results can be approved" });
      }

      const updated = await storage.updateResult(req.params.id, {
        status: "approved",
        approvedBy: req.user!.id,
        approvedAt: new Date(),
      });

      // Automatically calculate positions for this session/term/class
      try {
        const school = await storage.getSchool(req.user!.schoolId!);
        const computationMode = school?.computationMode || 'total_average_only';
        
        // Only calculate positions if computation mode includes positions
        if (computationMode !== 'total_average_only') {
          await storage.calculateAndUpdatePositions(
            req.user!.schoolId!,
            result.session,
            result.term,
            result.class
          );
        }
      } catch (posError) {
        // Log error but don't fail the approval
        console.error("Error calculating positions:", posError);
      }

      // Notify the uploader
      if (result.uploadedBy) {
        await storage.createNotification({
          userId: result.uploadedBy,
          type: "result_approved",
          title: "Result Approved",
          message: `Your result for ${result.session} ${result.term} Term has been approved.`,
          data: { resultId: result.id },
        });
      }

      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Reject result (moves from submitted back to draft/rejected)
  app.post("/api/results/:id/reject", authenticate, authorize("school_admin"), async (req: AuthRequest, res) => {
    try {
      const result = await storage.getResult(req.params.id);
      if (!result) {
        return res.status(404).json({ message: "Result not found" });
      }

      if (result.schoolId !== req.user!.schoolId) {
        return res.status(403).json({ message: "Cannot reject results from other schools" });
      }

      if (result.status !== "submitted") {
        return res.status(400).json({ message: "Only submitted results can be rejected" });
      }

      const { reason } = req.body;
      if (!reason) {
        return res.status(400).json({ message: "Rejection reason is required" });
      }

      const updated = await storage.updateResult(req.params.id, {
        status: "rejected",
        rejectionReason: reason,
      });

      // Notify the uploader
      if (result.uploadedBy) {
        await storage.createNotification({
          userId: result.uploadedBy,
          type: "result_rejected",
          title: "Result Rejected",
          message: `Your result for ${result.session} ${result.term} Term has been rejected. Reason: ${reason}`,
          data: { resultId: result.id, reason },
        });
      }

      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Publish result (moves from approved to published - permanent)
  app.post("/api/results/:id/publish", authenticate, authorize("school_admin"), async (req: AuthRequest, res) => {
    try {
      const result = await storage.getResult(req.params.id);
      if (!result) {
        return res.status(404).json({ message: "Result not found" });
      }

      if (result.schoolId !== req.user!.schoolId) {
        return res.status(403).json({ message: "Cannot publish results from other schools" });
      }

      if (result.status !== "approved") {
        return res.status(400).json({ message: "Only approved results can be published" });
      }

      const updated = await storage.updateResult(req.params.id, {
        status: "published",
        publishedAt: new Date(),
      });

      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Add comment to result
  app.post("/api/results/:id/comment", authenticate, authorize("school_admin", "teacher"), async (req: AuthRequest, res) => {
    try {
      const result = await storage.getResult(req.params.id);
      if (!result) {
        return res.status(404).json({ message: "Result not found" });
      }

      if (result.schoolId !== req.user!.schoolId) {
        return res.status(403).json({ message: "Cannot comment on results from other schools" });
      }

      // Published results cannot be edited
      if (result.status === "published") {
        return res.status(400).json({ message: "Published results cannot be modified" });
      }

      const { teacherComment, principalComment } = req.body;

      const updates: any = {};
      if (teacherComment !== undefined) {
        updates.teacherComment = teacherComment;
      }
      if (principalComment !== undefined && req.user!.role === "school_admin") {
        updates.principalComment = principalComment;
      }

      const updated = await storage.updateResult(req.params.id, updates);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ===== CSV TEMPLATE DOWNLOAD =====
  app.get("/api/csv-template/:classId", authenticate, async (req: AuthRequest, res) => {
    try {
      const schoolId = req.user!.schoolId;
      if (!schoolId) {
        return res.status(403).json({ message: "School association required" });
      }

      // Get class info
      const classData = await storage.getClass(req.params.classId);
      if (!classData || classData.schoolId !== schoolId) {
        return res.status(404).json({ message: "Class not found" });
      }

      // Get subjects assigned to this class
      const classSubjectsList = await storage.getClassSubjects(req.params.classId);
      const subjectIds = classSubjectsList.map(cs => cs.subjectId);

      const allSubjects = await storage.listSubjects(schoolId);
      const classSubjectsData = allSubjects.filter(s => subjectIds.includes(s.id));

      // Get score metrics for this school
      const metrics = await storage.listScoreMetrics(schoolId);

      // If no custom metrics, use defaults
      const metricColumns = metrics.length > 0
        ? metrics.map(m => m.name)
        : ["CA1", "CA2", "Exam"];

      // Build CSV header
      const subjectColumns: string[] = [];
      for (const subject of classSubjectsData) {
        for (const metric of metricColumns) {
          subjectColumns.push(`${subject.name}_${metric}`);
        }
      }

      const header = ["AdmissionNumber", "StudentName", ...subjectColumns].join(",");

      // Get students in this class for sample rows
      const students = await storage.listStudents(schoolId);
      const classStudents = students.filter(s => s.class === classData.name);

      const rows = classStudents.slice(0, 5).map(student => {
        const values = [student.admissionNumber, `${student.firstName} ${student.lastName}`];
        for (let i = 0; i < subjectColumns.length; i++) {
          values.push(""); // Empty score placeholder
        }
        return values.join(",");
      });

      const csv = [header, ...rows].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=result_template_${classData.name}.csv`);
      res.send(csv);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
