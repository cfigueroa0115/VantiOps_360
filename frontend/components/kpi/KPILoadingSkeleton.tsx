"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";

interface KPILoadingSkeletonProps {
  /** Number of skeleton cards to display (defaults to 13 for all KPIs) */
  count?: number;
}

/**
 * Loading skeleton for KPI cards with shimmer animation.
 * Displays placeholder cards while data is being fetched.
 */
export function KPILoadingSkeleton({ count = 13 }: KPILoadingSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} className="relative overflow-hidden">
          <CardContent className="p-4">
            {/* Label skeleton */}
            <div className="flex items-center gap-2 mb-2">
              <div className="h-4 w-4 rounded bg-muted animate-pulse" />
              <div className="h-4 w-28 rounded bg-muted animate-pulse" />
            </div>
            {/* Value skeleton */}
            <div className="h-8 w-24 rounded bg-muted animate-pulse" />
          </CardContent>
        </Card>
      ))}
    </>
  );
}
