"use client";

import React from "react";
import * as Slider from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

export interface RangeSliderProps {
  /** Minimum possible value (defaults to 0) */
  min?: number;
  /** Maximum possible value (dataset max days) */
  max: number;
  /** Current range [min, max] */
  value: [number, number];
  /** Called when range changes */
  onChange: (range: { min: number; max: number }) => void;
  /** Label displayed above the slider */
  label?: string;
  /** Step increment (defaults to 1) */
  step?: number;
  /** Additional class names */
  className?: string;
}

/**
 * RangeSlider — Dual-handle range slider for management time range (0 to max days).
 * Uses @radix-ui/react-slider for accessible dual-thumb functionality.
 */
export function RangeSlider({
  min = 0,
  max,
  value,
  onChange,
  label = "Tiempo de gestión (días)",
  step = 1,
  className,
}: RangeSliderProps) {
  function handleValueChange(newValue: number[]) {
    onChange({ min: newValue[0], max: newValue[1] });
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <span className="text-xs text-gray-500">
          {value[0]} — {value[1]} días
        </span>
      </div>

      <Slider.Root
        className="relative flex h-5 w-full touch-none select-none items-center"
        value={value}
        onValueChange={handleValueChange}
        min={min}
        max={max}
        step={step}
        aria-label={label}
      >
        <Slider.Track className="relative h-1.5 w-full grow rounded-full bg-gray-200">
          <Slider.Range className="absolute h-full rounded-full bg-blue-500" />
        </Slider.Track>
        <Slider.Thumb
          className="block h-4 w-4 rounded-full border-2 border-blue-500 bg-white
                     shadow focus:outline-none focus:ring-2 focus:ring-blue-300"
          aria-label="Mínimo"
        />
        <Slider.Thumb
          className="block h-4 w-4 rounded-full border-2 border-blue-500 bg-white
                     shadow focus:outline-none focus:ring-2 focus:ring-blue-300"
          aria-label="Máximo"
        />
      </Slider.Root>

      <div className="flex justify-between text-xs text-gray-400">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
