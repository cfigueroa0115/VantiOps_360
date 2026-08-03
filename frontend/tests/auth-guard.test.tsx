import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { AuthGuard } from "@/lib/auth/guard";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AuthGuard", () => {
  describe("authorized access", () => {
    it("renders children when userRole is in allowedRoles", () => {
      render(
        <AuthGuard allowedRoles={["SYSTEM_ADMIN", "ANALYST"]} userRole="SYSTEM_ADMIN">
          <p>Admin Content</p>
        </AuthGuard>
      );

      expect(screen.getByText("Admin Content")).toBeInTheDocument();
    });

    it("renders children for any matching role in the list", () => {
      render(
        <AuthGuard allowedRoles={["OPERATIONS_LEAD", "ANALYST", "AUDITOR"]} userRole="AUDITOR">
          <p>Auditor Content</p>
        </AuthGuard>
      );

      expect(screen.getByText("Auditor Content")).toBeInTheDocument();
    });

    it("does not render fallback when authorized", () => {
      render(
        <AuthGuard
          allowedRoles={["SYSTEM_ADMIN"]}
          userRole="SYSTEM_ADMIN"
          fallback={<p>Denied</p>}
        >
          <p>Allowed</p>
        </AuthGuard>
      );

      expect(screen.getByText("Allowed")).toBeInTheDocument();
      expect(screen.queryByText("Denied")).not.toBeInTheDocument();
    });
  });

  describe("denied access", () => {
    it("renders default fallback when userRole is not in allowedRoles", () => {
      render(
        <AuthGuard allowedRoles={["SYSTEM_ADMIN"]} userRole="INTERN_READONLY">
          <p>Secret Content</p>
        </AuthGuard>
      );

      expect(screen.queryByText("Secret Content")).not.toBeInTheDocument();
      expect(screen.getByText(/no tienes permisos/i)).toBeInTheDocument();
    });

    it("renders default fallback when userRole is null", () => {
      render(
        <AuthGuard allowedRoles={["SYSTEM_ADMIN"]} userRole={null}>
          <p>Protected</p>
        </AuthGuard>
      );

      expect(screen.queryByText("Protected")).not.toBeInTheDocument();
      expect(screen.getByText(/no tienes permisos/i)).toBeInTheDocument();
    });

    it("renders default fallback when userRole is undefined", () => {
      render(
        <AuthGuard allowedRoles={["SYSTEM_ADMIN"]}>
          <p>Protected</p>
        </AuthGuard>
      );

      expect(screen.queryByText("Protected")).not.toBeInTheDocument();
      expect(screen.getByText(/no tienes permisos/i)).toBeInTheDocument();
    });

    it("renders custom fallback when provided and unauthorized", () => {
      render(
        <AuthGuard
          allowedRoles={["SYSTEM_ADMIN"]}
          userRole="INTERN_READONLY"
          fallback={<p>Custom Denied Message</p>}
        >
          <p>Secret</p>
        </AuthGuard>
      );

      expect(screen.queryByText("Secret")).not.toBeInTheDocument();
      expect(screen.getByText("Custom Denied Message")).toBeInTheDocument();
    });

    it("default fallback mentions SYSTEM_ADMIN contact", () => {
      render(
        <AuthGuard allowedRoles={["SYSTEM_ADMIN"]} userRole="CONTRACTOR_OPERATOR">
          <p>Content</p>
        </AuthGuard>
      );

      expect(screen.getByText(/SYSTEM_ADMIN/)).toBeInTheDocument();
    });

    it("default fallback has role='alert' for accessibility", () => {
      render(
        <AuthGuard allowedRoles={["SYSTEM_ADMIN"]} userRole="INTERN_READONLY">
          <p>Content</p>
        </AuthGuard>
      );

      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("default fallback has aria-live='polite'", () => {
      render(
        <AuthGuard allowedRoles={["SYSTEM_ADMIN"]} userRole="INTERN_READONLY">
          <p>Content</p>
        </AuthGuard>
      );

      expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "polite");
    });
  });

  describe("edge cases", () => {
    it("denies access when allowedRoles is empty", () => {
      render(
        <AuthGuard allowedRoles={[]} userRole="SYSTEM_ADMIN">
          <p>Content</p>
        </AuthGuard>
      );

      expect(screen.queryByText("Content")).not.toBeInTheDocument();
    });

    it("handles multiple children correctly when authorized", () => {
      render(
        <AuthGuard allowedRoles={["ANALYST"]} userRole="ANALYST">
          <p>First</p>
          <p>Second</p>
        </AuthGuard>
      );

      expect(screen.getByText("First")).toBeInTheDocument();
      expect(screen.getByText("Second")).toBeInTheDocument();
    });
  });
});
