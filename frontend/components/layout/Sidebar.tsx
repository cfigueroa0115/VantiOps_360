"use client";

import React from "react";
import {
  LayoutDashboard,
  Database,
  ShieldAlert,
  SearchCode,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Navigation item definition */
interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/",
    icon: <LayoutDashboard size={20} />,
  },
  {
    label: "Calidad de Datos",
    href: "/calidad",
    icon: <Database size={20} />,
  },
  {
    label: "Modelo de Riesgo",
    href: "/riesgo",
    icon: <ShieldAlert size={20} />,
  },
  {
    label: "Análisis de Causa Raíz",
    href: "/rca",
    icon: <SearchCode size={20} />,
  },
];

export interface SidebarProps {
  /** Currently active path for highlighting */
  activePath?: string;
  /** Additional class names */
  className?: string;
}

/**
 * Vertical sidebar navigation for dashboard sections.
 * Highlights the active page link.
 * (Req 5.2: Navigation between sections)
 */
export function Sidebar({ activePath = "/", className }: SidebarProps) {
  return (
    <aside
      className={cn(
        "flex h-full w-64 flex-col border-r border-gray-200 bg-white",
        className,
      )}
    >
      {/* Brand */}
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
          <LayoutDashboard size={16} className="text-white" />
        </div>
        <span className="text-sm font-bold text-gray-900">VantiOps 360</span>
      </div>

      {/* Navigation links */}
      <nav className="flex-1 px-3 py-4" aria-label="Navegación principal">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = activePath === item.href;
            return (
              <li key={item.href}>
                <a
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span
                    className={cn(
                      isActive ? "text-blue-600" : "text-gray-400",
                    )}
                  >
                    {item.icon}
                  </span>
                  {item.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-100 px-4 py-3">
        <p className="text-xs text-gray-400">Panel Ejecutivo PQR</p>
      </div>
    </aside>
  );
}
