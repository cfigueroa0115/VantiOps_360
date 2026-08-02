"use client";

import React, { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import * as Checkbox from "@radix-ui/react-checkbox";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MultiSelectProps {
  /** List of available options */
  options: string[];
  /** Currently selected values */
  selected: string[];
  /** Called when selection changes */
  onChange: (selected: string[]) => void;
  /** Label displayed above the dropdown */
  label: string;
  /** Placeholder text when nothing is selected */
  placeholder?: string;
  /** Additional class names */
  className?: string;
}

/**
 * MultiSelect — Reusable multi-select dropdown with checkboxes.
 * Uses @radix-ui/react-popover for the dropdown panel.
 * Props: options[], selected[], onChange, label, placeholder.
 */
export function MultiSelect({
  options,
  selected,
  onChange,
  label,
  placeholder = "Seleccionar...",
  className,
}: MultiSelectProps) {
  const [search, setSearch] = useState("");

  const filteredOptions = options.filter((opt) =>
    opt.toLowerCase().includes(search.toLowerCase()),
  );

  function handleToggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((s) => s !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  function handleSelectAll() {
    onChange([...filteredOptions]);
  }

  function handleClearSelection() {
    onChange([]);
  }

  const displayText =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? selected[0]
        : `${selected.length} seleccionados`;

  return (
    <div className={cn("space-y-1", className)}>
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-md border border-gray-300
                       bg-white px-3 py-2 text-sm text-left hover:border-gray-400
                       focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            aria-label={`${label}: ${displayText}`}
          >
            <span className={cn(selected.length === 0 && "text-gray-400")}>
              {displayText}
            </span>
            <ChevronDown className="h-4 w-4 text-gray-400" />
          </button>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content
            className="z-50 w-[var(--radix-popover-trigger-width)] rounded-md border border-gray-200
                       bg-white shadow-lg animate-in fade-in-0 zoom-in-95"
            sideOffset={4}
            align="start"
          >
            {/* Search input */}
            <div className="border-b border-gray-100 p-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar..."
                className="w-full rounded border border-gray-200 px-2 py-1 text-sm
                           focus:border-blue-500 focus:outline-none"
                aria-label={`Buscar en ${label}`}
              />
            </div>

            {/* Quick actions */}
            <div className="flex gap-2 border-b border-gray-100 px-2 py-1">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Todos
              </button>
              <button
                type="button"
                onClick={handleClearSelection}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Ninguno
              </button>
            </div>

            {/* Options list */}
            <div className="max-h-48 overflow-y-auto p-1">
              {filteredOptions.length === 0 ? (
                <p className="px-2 py-3 text-center text-sm text-gray-400">
                  Sin resultados
                </p>
              ) : (
                filteredOptions.map((option) => (
                  <label
                    key={option}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5
                               hover:bg-gray-50"
                  >
                    <Checkbox.Root
                      checked={selected.includes(option)}
                      onCheckedChange={() => handleToggle(option)}
                      className="flex h-4 w-4 items-center justify-center rounded border
                                 border-gray-300 data-[state=checked]:border-blue-600
                                 data-[state=checked]:bg-blue-600"
                    >
                      <Checkbox.Indicator>
                        <Check className="h-3 w-3 text-white" />
                      </Checkbox.Indicator>
                    </Checkbox.Root>
                    <span className="text-sm text-gray-700 truncate">{option}</span>
                  </label>
                ))
              )}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
