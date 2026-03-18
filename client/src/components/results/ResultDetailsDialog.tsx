import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, MessageSquare, Send, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "wouter";
import type { Result, Student, School } from "@shared/schema";

interface ResultDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: Result | null;
}

export function ResultDetailsDialog({ open, onOpenChange, result: initialResult }: ResultDetailsDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const isTeacher = user.role === "teacher";
  const isSchoolAdmin = user.role === "school_admin";

  const { data: students = [] } = useQuery<Student[]>({
    queryKey: ["/api/students"],
  });

  const { data: results = [] } = useQuery<Result[]>({
    queryKey: ["/api/results"],
  });

  const { data: mySchool, isLoading: schoolLoading } = useQuery<School>({
    queryKey: ["/api/schools/me"],
    enabled: isSchoolAdmin || isTeacher,
  });

  const result = initialResult ? results.find(r => r.id === initialResult.id) || initialResult : null;
  const student = students.find((s) => s.id === result?.studentId);
  const hasSchoolLogo = Boolean(mySchool?.logo);
  const schoolDataLoaded = !schoolLoading && mySchool !== undefined;

  useEffect(() => {
    if (!open) {
      setComment("");
      setRejectionReason("");
    }
  }, [open]);

  const handleAddComment = async () => {
    if (!comment.trim() || !result) return;
    if (!isTeacher && !isSchoolAdmin) return;

    setLoading(true);
    try {
      await apiRequest("POST", `/api/results/${result.id}/comment`, isTeacher
        ? { teacherComment: comment }
        : { principalComment: comment });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/results"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/students"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/schools/me"] }),
      ]);
      
      toast({
        title: "Comment Added",
        description: isTeacher ? "Teacher comment added successfully" : "Principal comment added successfully",
      });
      setComment("");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!result || !isSchoolAdmin) return;

    if (!hasSchoolLogo) {
      toast({
        variant: "destructive",
        title: "School Logo Required",
        description: "Please upload your school logo in Profile Settings before approving results",
      });
      return;
    }

    setApproving(true);
    try {
      await apiRequest("POST", `/api/results/${result.id}/approve`, {});
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/results"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/students"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/schools/me"] }),
      ]);
      
      toast({
        title: "Result Approved",
        description: "The result has been approved and is now available for students",
      });
      onOpenChange(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Cannot Approve",
        description: error.message,
      });
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!result || !isSchoolAdmin) return;
    
    if (!rejectionReason.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please provide a reason for rejection",
      });
      return;
    }

    setRejecting(true);
    try {
      await apiRequest("POST", `/api/results/${result.id}/reject`, { reason: rejectionReason });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/results"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/students"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/schools/me"] }),
      ]);
      
      toast({
        title: "Result Rejected",
        description: "The result has been rejected and sent back to the teacher",
      });
      setRejectionReason("");
      onOpenChange(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setRejecting(false);
    }
  };

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case "A": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "B": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "C": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "D": return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
      default: return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft": return <Badge variant="secondary">Draft</Badge>;
      case "submitted": return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">Submitted</Badge>;
      case "approved": return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Approved</Badge>;
      case "rejected": return <Badge variant="destructive">Rejected</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  if (!result) return null;

  const subjects = Array.isArray(result.subjects) ? result.subjects : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Result Details
            {getStatusBadge(result.status)}
          </DialogTitle>
          <DialogDescription>
            {result.session} - {result.term} Term
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* School Logo Warning for School Admin */}
          {isSchoolAdmin && result.status === "submitted" && schoolDataLoaded && !hasSchoolLogo && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                You must upload your school logo before you can approve results.{" "}
                <Link 
                  href="/profile" 
                  className="underline font-semibold hover:text-destructive-foreground/80"
                  onClick={() => onOpenChange(false)}
                  data-testid="link-profile-settings"
                >
                  Click here to go to Profile Settings
                </Link>
              </AlertDescription>
            </Alert>
          )}

          {/* Student Info */}
          <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50 border">
            <div>
              <p className="text-sm text-muted-foreground">Student</p>
              <p className="font-semibold" data-testid="text-student-name">
                {student ? `${student.firstName} ${student.lastName}` : "Unknown Student"}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Registration Number</p>
              <p className="font-semibold font-mono">
                {student?.admissionNumber || result.studentId.substring(0, 8)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Class</p>
              <p className="font-semibold">{result.class}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Average Score</p>
              <p className="font-semibold">{result.averageScore}%</p>
            </div>
          </div>

          {/* Subjects Table */}
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead className="text-center">CA1</TableHead>
                  <TableHead className="text-center">CA2</TableHead>
                  <TableHead className="text-center">Exam</TableHead>
                  <TableHead className="text-center">Total</TableHead>
                  <TableHead className="text-center">Grade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subjects.map((subject: any, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{subject.subject}</TableCell>
                    <TableCell className="text-center">{subject.ca1}</TableCell>
                    <TableCell className="text-center">{subject.ca2}</TableCell>
                    <TableCell className="text-center">{subject.exam}</TableCell>
                    <TableCell className="text-center font-bold">{subject.total}</TableCell>
                    <TableCell className="text-center">
                      <Badge className={getGradeColor(subject.grade)}>{subject.grade}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Existing Comments */}
          {(result.teacherComment || result.principalComment) && (
            <div className="space-y-3">
              <h4 className="font-semibold flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Comments
              </h4>
              {result.teacherComment && (
                <div className="p-3 rounded-lg bg-muted/50 border">
                  <p className="text-xs text-muted-foreground mb-1">Teacher's Comment</p>
                  <p className="text-sm">{result.teacherComment}</p>
                </div>
              )}
              {result.principalComment && (
                <div className="p-3 rounded-lg bg-muted/50 border">
                  <p className="text-xs text-muted-foreground mb-1">Principal's Comment</p>
                  <p className="text-sm">{result.principalComment}</p>
                </div>
              )}
            </div>
          )}

          {/* Add Comment Section */}
          {(isTeacher || isSchoolAdmin) && (
            <div className="space-y-3">
              <Label>
                {isTeacher ? "Add Teacher Comment" : "Add Principal Comment"}
              </Label>
              <div className="flex gap-2">
                <Textarea
                  placeholder={`Enter your ${isTeacher ? "teacher" : "principal"} comment...`}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="flex-1"
                  data-testid="input-comment"
                />
                <Button
                  onClick={handleAddComment}
                  disabled={loading || !comment.trim()}
                  data-testid="button-add-comment"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Approval Actions (School Admin only) */}
          {isSchoolAdmin && result.status === "submitted" && (
            <div className="space-y-4 pt-4 border-t">
              <div className="space-y-2">
                <Label>Rejection Reason (if rejecting)</Label>
                <Textarea
                  placeholder="Enter reason for rejection..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  data-testid="input-rejection-reason"
                />
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 text-red-600 hover:text-red-700"
                  onClick={handleReject}
                  disabled={rejecting}
                  data-testid="button-reject"
                >
                  {rejecting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <XCircle className="w-4 h-4 mr-2" />
                  )}
                  Reject
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleApprove}
                  disabled={approving || !schoolDataLoaded || !hasSchoolLogo}
                  data-testid="button-approve"
                >
                  {approving ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4 mr-2" />
                  )}
                  Approve
                </Button>
              </div>
            </div>
          )}

          {/* Rejection Info */}
          {result.status === "rejected" && result.rejectionReason && (
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-sm font-semibold text-destructive mb-1">Rejection Reason</p>
              <p className="text-sm">{result.rejectionReason}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
