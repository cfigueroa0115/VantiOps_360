import React from "react";
import { AlertTriangle } from "lucide-react";

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onReset?: () => void;
  resetKeys?: unknown[];
  componentName?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * React error boundary with retry support.
 * When resetKeys change, the error state is cleared automatically.
 * The Reintentar button calls onReset (which should re-fetch data).
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private prevResetKeys: unknown[] | undefined;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
    this.prevResetKeys = props.resetKeys;
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error(`[ErrorBoundary${this.props.componentName ? ` - ${this.props.componentName}` : ""}]`, error.message);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    // Clear error when resetKeys change (e.g., new data arrives or filters change)
    if (this.state.hasError && this.props.resetKeys) {
      const keysChanged = !prevProps.resetKeys ||
        prevProps.resetKeys.length !== this.props.resetKeys.length ||
        prevProps.resetKeys.some((k, i) => k !== this.props.resetKeys![i]);

      if (keysChanged) {
        this.setState({ hasError: false, error: null });
      }
    }
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
    // Call onReset to trigger data re-fetch
    this.props.onReset?.();
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center rounded-lg border border-red-200 bg-red-50 p-6 text-center" role="alert">
          <AlertTriangle className="mb-3 h-8 w-8 text-red-500" />
          <h3 className="text-sm font-semibold text-red-800">
            No fue posible representar este gráfico
          </h3>
          <p className="mt-1 text-xs text-red-600">
            Se detectó una incompatibilidad en los datos recibidos.
          </p>
          {this.props.componentName && (
            <p className="mt-1 text-[10px] text-red-400">Componente: {this.props.componentName}</p>
          )}
          <button
            type="button"
            onClick={this.handleRetry}
            className="mt-4 inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
          >
            Reintentar
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
