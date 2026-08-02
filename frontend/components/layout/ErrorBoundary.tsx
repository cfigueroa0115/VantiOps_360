import React from "react";
import { AlertTriangle } from "lucide-react";

export interface ErrorBoundaryProps {
  /** Child components to render */
  children: React.ReactNode;
  /** Optional fallback UI to render on error (overrides default) */
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * React error boundary that catches rendering errors from child chart components
 * and shows a fallback UI with the error message and a "Reintentar" button.
 * (Req 5.5 / 14.8: Graceful error handling for chart render failures)
 */
export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log error for debugging; in production this could report to a monitoring service
    console.error("[ErrorBoundary] Chart render failure:", error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          className="flex flex-col items-center justify-center rounded-lg border border-red-200 bg-red-50 p-6 text-center"
          role="alert"
        >
          <AlertTriangle className="mb-3 h-8 w-8 text-red-500" />
          <h3 className="text-sm font-semibold text-red-800">
            Error al renderizar el componente
          </h3>
          <p className="mt-1 text-xs text-red-600">
            {this.state.error?.message ?? "Ha ocurrido un error inesperado"}
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="mt-4 inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
          >
            Reintentar
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
