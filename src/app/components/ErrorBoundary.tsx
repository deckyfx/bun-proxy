import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{error?: Error; errorInfo?: React.ErrorInfo}>;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback;
        return <FallbackComponent error={this.state.error} errorInfo={this.state.errorInfo} />;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
            <div className="flex items-center mb-4">
              <span className="material-icons text-red-500 text-2xl mr-3">error</span>
              <h1 className="text-xl font-semibold text-gray-900">Something went wrong</h1>
            </div>
            
            <div className="mb-4">
              <p className="text-gray-600 mb-3">
                An unexpected error occurred while rendering this page.
              </p>
              
              {this.state.error && (
                <details className="mb-3">
                  <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                    Error Details
                  </summary>
                  <div className="mt-2 p-3 bg-gray-100 rounded border text-xs font-mono text-gray-800 overflow-auto max-h-40">
                    <div className="font-semibold mb-1">Error:</div>
                    <div className="mb-2">{this.state.error.message}</div>
                    {this.state.error.stack && (
                      <>
                        <div className="font-semibold mb-1">Stack Trace:</div>
                        <pre className="whitespace-pre-wrap">{this.state.error.stack}</pre>
                      </>
                    )}
                  </div>
                </details>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => this.setState({ hasError: false, error: undefined, errorInfo: undefined })}
                className="flex-1 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="flex-1 bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 transition-colors"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;