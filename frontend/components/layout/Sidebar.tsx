"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { VantiLogo } from "@/components/brand/VantiLogo";
import {
  LayoutDashboard,
  Database,
  ShieldAlert,
  SearchCode,
  Network,
  Users,
  FileX2,
  ArrowRightLeft,
  Radio,
  CalendarDays,
  Scale,
  FileCheck,
  Info,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Fase 1",
    items: [
      { label: "Dashboard", href: "/", icon: <LayoutDashboard size={18} /> },
      { label: "Calidad", href: "/calidad", icon: <Database size={18} /> },
      { label: "Riesgo", href: "/riesgo", icon: <ShieldAlert size={18} /> },
      { label: "Causa Raíz", href: "/rca", icon: <SearchCode size={18} /> },
    ],
  },
  {
    title: "Fase 2",
    items: [
      { label: "Arquitectura", href: "/arquitectura", icon: <Network size={18} /> },
      { label: "Aliados", href: "/aliados", icon: <Users size={18} /> },
      { label: "Anulaciones", href: "/anulaciones", icon: <FileX2 size={18} /> },
      { label: "Migración", href: "/migracion", icon: <ArrowRightLeft size={18} /> },
    ],
  },
  {
    title: "Fase 3",
    items: [
      { label: "Operaciones", href: "/operaciones", icon: <Radio size={18} /> },
      { label: "Plan 30-60-90", href: "/plan-30-60-90", icon: <CalendarDays size={18} /> },
      { label: "Proveedores", href: "/proveedores", icon: <Scale size={18} /> },
    ],
  },
  {
    title: "Evidencia",
    items: [
      { label: "Evidencia", href: "/evidencia", icon: <FileCheck size={18} /> },
      { label: "Acerca de", href: "/about", icon: <Info size={18} /> },
    ],
  },
];

export interface SidebarProps {
  activePath?: string;
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Close on escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, []);

  const sidebarContent = (
    <>
      {/* Brand */}
      <div className="border-b border-gray-100 px-3 py-5">
        <div className="flex flex-col items-center">
          <VantiLogo size="md" className="rounded-xl p-3" />
          <span className="mt-3 text-center text-xl font-bold tracking-tight text-slate-900">
            VantiOps 360
          </span>
        </div>
      </div>

      {/* Navigation links */}
      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Navegación principal">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="mb-4">
            <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-blue-50 text-blue-700"
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                      )}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <span className={cn(isActive ? "text-blue-600" : "text-gray-400")}>
                        {item.icon}
                      </span>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-100 px-4 py-3">
        <p className="text-xs text-gray-400">VantiOps 360 — Prototipo</p>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-[30px] left-3 z-40 flex h-9 w-9 items-center justify-center rounded-lg bg-white border border-gray-200 shadow-sm lg:hidden"
        aria-label="Abrir menú de navegación"
      >
        <Menu size={18} className="text-gray-700" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar (slide-in) */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-full w-64 flex-col border-r border-gray-200 bg-white transition-transform duration-300 ease-in-out lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Close button */}
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          aria-label="Cerrar menú"
        >
          <X size={18} className="text-gray-600" />
        </button>
        {sidebarContent}
      </aside>

      {/* Desktop sidebar (always visible) */}
      <aside
        className={cn(
          "hidden lg:flex h-full w-64 flex-col border-r border-gray-200 bg-white shrink-0",
          className,
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
