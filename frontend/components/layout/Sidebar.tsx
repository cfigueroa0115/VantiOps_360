"use client";

import React from "react";
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

  return (
    <aside
      className={cn(
        "flex h-full w-64 flex-col border-r border-gray-200 bg-white",
        className,
      )}
    >
      {/* Brand */}
      <div className="border-b border-gray-100 px-3 py-4">
        <VantiLogo size="sm" className="mx-auto" />
        <p className="text-[10px] text-center text-gray-500 mt-1">VantiOps 360</p>
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
    </aside>
  );
}
