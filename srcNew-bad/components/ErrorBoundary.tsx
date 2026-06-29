import React from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null,
      errorInfo: null 
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('🔴 ErrorBoundary caught error:', error);
    console.error('🔴 Component stack:', errorInfo.componentStack);
    console.error('🔴 Error name:', error.name);
    console.error('🔴 Error message:', error.message);
    
    this.setState({ errorInfo });
    
    // Log to external service (uncomment when ready)
    // Example: Sentry.captureException(error, { extra: errorInfo });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-warm-ivory flex items-center justify-center p-6">
          <div className="max-w-2xl bg-white rounded-2xl shadow-xl border-2 border-gentle-coral p-8 space-y-6">
            
            {/* Header */}
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gentle-coral/10 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-2xl">⚠️</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gentle-coral">Application Error</h1>
                <p className="text-medium-gray text-sm">Something went wrong while rendering this page</p>
              </div>
            </div>

            {/* Error Details */}
            <div className="bg-gentle-coral/5 border border-gentle-coral/20 rounded-xl p-4 space-y-3">
              <div>
                <p className="text-xs font-semibold text-medium-gray uppercase tracking-wide mb-1">Error Type</p>
                <p className="text-sm font-mono text-charcoal">{this.state.error?.name || 'Unknown Error'}</p>
              </div>
              
              <div>
                <p className="text-xs font-semibold text-medium-gray uppercase tracking-wide mb-1">Error Message</p>
                <p className="text-sm text-charcoal">{this.state.error?.message || 'No message provided'}</p>
              </div>
            </div>

            {/* Stack Trace (Collapsible) */}
            <details className="bg-soft-taupe/30 rounded-xl overflow-hidden">
              <summary className="cursor-pointer px-4 py-3 font-semibold text-charcoal hover:bg-soft-taupe/50 transition-colors">
                View Stack Trace
              </summary>
              <div className="px-4 py-3 border-t border-soft-taupe">
                <pre className="text-xs overflow-auto text-medium-gray whitespace-pre-wrap max-h-64 font-mono">
                  {this.state.error?.stack || 'No stack trace available'}
                </pre>
              </div>
            </details>

            {/* Component Stack (if available) */}
            {this.state.errorInfo && (
              <details className="bg-soft-taupe/30 rounded-xl overflow-hidden">
                <summary className="cursor-pointer px-4 py-3 font-semibold text-charcoal hover:bg-soft-taupe/50 transition-colors">
                  View Component Stack
                </summary>
                <div className="px-4 py-3 border-t border-soft-taupe">
                  <pre className="text-xs overflow-auto text-medium-gray whitespace-pre-wrap max-h-64 font-mono">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </div>
              </details>
            )}

            {/* Help Text */}
            <div className="bg-warm-bronze/10 border border-warm-bronze/30 rounded-xl p-4 space-y-2">
              <p className="text-sm font-semibold text-charcoal">💡 Common Causes:</p>
              <ul className="text-sm text-medium-gray space-y-1 list-disc list-inside">
                <li>React hooks called conditionally or after early returns</li>
                <li>Missing or incorrect dependencies in useEffect</li>
                <li>State updates on unmounted components</li>
                <li>Accessing properties of undefined objects</li>
                <li>Network errors or API failures</li>
              </ul>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 px-4 py-3 bg-warm-bronze text-white rounded-xl hover:bg-deep-bronze transition-colors font-medium"
              >
                🔄 Refresh Page
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="flex-1 px-4 py-3 bg-white border border-soft-taupe text-charcoal rounded-xl hover:bg-soft-taupe/20 transition-colors font-medium"
              >
                🏠 Go Home
              </button>
            </div>

            {/* Developer Note */}
            <p className="text-xs text-medium-gray text-center pt-2 border-t border-soft-taupe">
              This error has been logged. Check the browser console for more details.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;