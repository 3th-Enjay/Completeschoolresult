import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useEffect, useState } from "react";

// Public Pages
import Landing from "@/pages/landing";
import Login from "@/pages/login";
import Register from "@/pages/register";
import CheckResult from "@/pages/check-result";
import NotFound from "@/pages/not-found";

// Dashboard Pages
import Dashboard from "@/pages/dashboard";
import Schools from "@/pages/schools";
import Students from "@/pages/students";
import Results from "@/pages/results";
import Pins from "@/pages/pins";
import Teachers from "@/pages/teachers";
import Classes from "@/pages/classes";
import Subjects from "@/pages/subjects";
import PinRequests from "@/pages/pin-requests";
import Users from "@/pages/users";
import Analytics from "@/pages/analytics";
import Profile from "@/pages/profile";
import ScoreMetrics from "@/pages/score-metrics";

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  schoolId?: string;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [isValidating, setIsValidating] = useState(true);

  useEffect(() => {
    const validateSession = async () => {
      const storedUser = localStorage.getItem("user");
      const token = localStorage.getItem("token");
      
      if (!storedUser || !token) {
        localStorage.removeItem("user");
        localStorage.removeItem("token");
        setLocation("/login");
        return;
      }
      
      try {
        // Validate token with server
        const response = await fetch("/api/auth/me", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          // Token is invalid or expired
          localStorage.removeItem("user");
          localStorage.removeItem("token");
          queryClient.cancelQueries();
          queryClient.clear();
          setLocation("/login");
          return;
        }

        const userData = await response.json();
        setUser(userData);
        
        // Update stored user data in case it changed
        localStorage.setItem("user", JSON.stringify(userData));
      } catch (error) {
        // Network error or invalid response
        localStorage.removeItem("user");
        localStorage.removeItem("token");
        queryClient.cancelQueries();
        queryClient.clear();
        setLocation("/login");
      } finally {
        setIsValidating(false);
      }
    };

    validateSession();
  }, [setLocation]);

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    // Cancel pending queries and clear cache to prevent stale data when switching users
    queryClient.cancelQueries();
    queryClient.clear();
    setLocation("/login");
  };

  if (isValidating || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Validating session...</p>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout user={user} onLogout={handleLogout}>
      {children}
    </DashboardLayout>
  );
}

function Router() {
  return (
    <Switch>
      {/* Public Routes */}
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/check-result" component={CheckResult} />

      {/* Protected Dashboard Routes */}
      <Route path="/dashboard">
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      </Route>

      <Route path="/schools">
        <ProtectedRoute>
          <Schools />
        </ProtectedRoute>
      </Route>

      <Route path="/students">
        <ProtectedRoute>
          <Students />
        </ProtectedRoute>
      </Route>

      <Route path="/results">
        <ProtectedRoute>
          <Results />
        </ProtectedRoute>
      </Route>

      <Route path="/pins">
        <ProtectedRoute>
          <Pins />
        </ProtectedRoute>
      </Route>

      <Route path="/teachers">
        <ProtectedRoute>
          <Teachers />
        </ProtectedRoute>
      </Route>

      <Route path="/classes">
        <ProtectedRoute>
          <Classes />
        </ProtectedRoute>
      </Route>

      <Route path="/subjects">
        <ProtectedRoute>
          <Subjects />
        </ProtectedRoute>
      </Route>

      <Route path="/pin-requests">
        <ProtectedRoute>
          <PinRequests />
        </ProtectedRoute>
      </Route>

      <Route path="/users">
        <ProtectedRoute>
          <Users />
        </ProtectedRoute>
      </Route>

      <Route path="/analytics">
        <ProtectedRoute>
          <Analytics />
        </ProtectedRoute>
      </Route>

      <Route path="/profile">
        <ProtectedRoute>
          <Profile />
        </ProtectedRoute>
      </Route>

      <Route path="/score-metrics">
        <ProtectedRoute>
          <ScoreMetrics />
        </ProtectedRoute>
      </Route>

      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
