/**
 * Build an executive Pareto that shows max 10 individual items + "Otras causas"
 */

export interface ParetoDataPoint {
  causa: string;
  count: number;
  percentage: number;
  cumulative_pct: number;
  aggregated?: boolean;
}

export interface ExecutiveParetoResult {
  data: ParetoDataPoint[];
  coreCauseCount: number;
  coreCumulativePct: number;
  contextCauseCount: number;
  displayedIndividualCount: number;
  displayedCumulativePct: number;
  hiddenCauseCount: number;
  aggregatedCount: number;
  threshold: number;
}

export function buildExecutivePareto(
  input: ParetoDataPoint[],
  threshold = 80,
  contextItems = 3,
  maxVisibleItems = 10
): ExecutiveParetoResult {
  if (!input.length) {
    return {
      data: [],
      coreCauseCount: 0,
      coreCumulativePct: 0,
      contextCauseCount: 0,
      displayedIndividualCount: 0,
      displayedCumulativePct: 0,
      hiddenCauseCount: 0,
      aggregatedCount: 0,
      threshold,
    };
  }

  // Already sorted descending by count
  const sorted = [...input].sort((a, b) => b.count - a.count);
  const totalCount = sorted.reduce((sum, item) => sum + item.count, 0);

  if (totalCount === 0) {
    return {
      data: [],
      coreCauseCount: 0,
      coreCumulativePct: 0,
      contextCauseCount: 0,
      displayedIndividualCount: 0,
      displayedCumulativePct: 0,
      hiddenCauseCount: 0,
      aggregatedCount: 0,
      threshold,
    };
  }

  // Find core causes (until cumulative >= threshold)
  let cumulativeCount = 0;
  let coreIndex = 0;
  for (let i = 0; i < sorted.length; i++) {
    cumulativeCount += sorted[i].count;
    coreIndex = i;
    if ((cumulativeCount / totalCount) * 100 >= threshold) break;
  }
  const coreCauseCount = coreIndex + 1;
  const coreCumulativePct = Math.round((cumulativeCount / totalCount) * 10000) / 100;

  // Add context items (capped by maxVisibleItems)
  const contextEnd = Math.min(coreCauseCount + contextItems, maxVisibleItems, sorted.length);
  const contextCauseCount = contextEnd - coreCauseCount;
  const displayEnd = contextEnd;
  const displayed = sorted.slice(0, displayEnd);
  const hidden = sorted.slice(displayEnd);

  // Build result with recalculated cumulative
  let runningCount = 0;
  const result: ParetoDataPoint[] = displayed.map(item => {
    runningCount += item.count;
    return {
      causa: item.causa,
      count: item.count,
      percentage: Math.round((item.count / totalCount) * 10000) / 100,
      cumulative_pct: Math.round((runningCount / totalCount) * 10000) / 100,
      aggregated: false,
    };
  });

  const displayedCumulativePct = displayed.length > 0
    ? Math.round((displayed.reduce((s, i) => s + i.count, 0) / totalCount) * 10000) / 100
    : 0;

  // Add "Otras causas" if there are hidden items
  let aggregatedCount = 0;
  if (hidden.length > 0) {
    const hiddenCount = hidden.reduce((sum, item) => sum + item.count, 0);
    aggregatedCount = hiddenCount;
    runningCount += hiddenCount;
    result.push({
      causa: "Otras causas",
      count: hiddenCount,
      percentage: Math.round((hiddenCount / totalCount) * 10000) / 100,
      cumulative_pct: 100,
      aggregated: true,
    });
  }

  return {
    data: result,
    coreCauseCount,
    coreCumulativePct,
    contextCauseCount,
    displayedIndividualCount: displayed.length,
    displayedCumulativePct,
    hiddenCauseCount: hidden.length,
    aggregatedCount,
    threshold,
  };
}
