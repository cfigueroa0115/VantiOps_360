"use client";

import * as React from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Database, FlaskConical, Cpu, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Data provenance categories as defined in REQ-06.
 * Each data element in VantiOps 360 must be classified into one of these categories.
 */
export type DataProvenance =
  | "REAL_DATA"
  | "DERIVED_DATA"
  | "SIMULATED_DATA"
  | "CONCEPTUAL_DESIGN";

export interface ProvenanceBadgeProps {
  /** The data provenance category to display */
  provenance: DataProvenance;
  /** Badge size variant */
  size?: "sm" | "md";
  /** Additional class names */
  className?: string;
}

/** Configuration per provenance category: label, description, color classes, icon */
const PROVENANCE_CONFIG: Record<
  DataProvenance,
  {
    label: string;
    description: string;
    bgClass: string;
    textClass: string;
    borderClass: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  REAL_DATA: {
    label: "Real",
    description:
      "Dato proveniente del endpoint real de API o base de datos Neon PostgreSQL.",
    bgClass: "bg-green-50",
    textClass: "text-green-700",
    borderClass: "border-green-200",
    icon: Database,
  },
  DERIVED_DATA: {
    label: "Derivado",
    description:
      "Dato calculado a partir de datos reales mediante transformación verificable.",
    bgClass: "bg-blue-50",
    textClass: "text-blue-700",
    borderClass: "border-blue-200",
    icon: Cpu,
  },
  SIMULATED_DATA: {
    label: "Simulado",
    description:
      "Dato generado sintéticamente para pruebas, demos o desarrollo.",
    bgClass: "bg-amber-50",
    textClass: "text-amber-700",
    borderClass: "border-amber-200",
    icon: FlaskConical,
  },
  CONCEPTUAL_DESIGN: {
    label: "Conceptual",
    description:
      "Diseño técnico documentado que representa una solución futura no conectada a sistemas productivos.",
    bgClass: "bg-purple-50",
    textClass: "text-purple-700",
    borderClass: "border-purple-200",
    icon: Lightbulb,
  },
};

/**
 * ProvenanceBadge — Visual indicator showing the data provenance category.
 *
 * Displays a small badge/chip with a distinct color per category:
 * - REAL_DATA → green
 * - DERIVED_DATA → blue
 * - SIMULATED_DATA → amber
 * - CONCEPTUAL_DESIGN → purple
 *
 * Includes a tooltip on hover with the category description.
 *
 * @see Requirements 6.3
 */
export function ProvenanceBadge({
  provenance,
  size = "sm",
  className,
}: ProvenanceBadgeProps) {
  const config = PROVENANCE_CONFIG[provenance];
  const Icon = config.icon;

  const sizeClasses = size === "sm" ? "text-xs px-1.5 py-0.5" : "text-sm px-2 py-1";
  const iconSize = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";

  return (
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span
            role="status"
            aria-label={`Proveniencia: ${config.label}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border font-medium leading-none",
              config.bgClass,
              config.textClass,
              config.borderClass,
              sizeClasses,
              className
            )}
          >
            <Icon className={iconSize} aria-hidden="true" />
            <span>{config.label}</span>
          </span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="z-50 max-w-xs rounded-md bg-gray-900 px-3 py-2 text-xs text-white shadow-lg"
            sideOffset={5}
          >
            <p className="font-semibold">{provenance}</p>
            <p className="mt-1 opacity-90">{config.description}</p>
            <Tooltip.Arrow className="fill-gray-900" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

export default ProvenanceBadge;
