import React from 'react';
import { ErrorFallback } from './ErrorFallback';

interface ErrorBoundaryProps {
  /** "page": falla una pantalla y el menú sigue; "app": falla todo y hay que recargar. */
  scope: 'page' | 'app';
  /** Cuando cambia (por ejemplo, otra pantalla), el error se descarta y se vuelve a intentar. */
  resetKey?: string;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/** Atrapa los errores al dibujar la pantalla, para mostrar un mensaje claro en vez de una pantalla en blanco. */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Error al mostrar la pantalla:', error, info.componentStack);
  }

  componentDidUpdate(previous: ErrorBoundaryProps): void {
    if (this.state.hasError && previous.resetKey !== this.props.resetKey) this.setState({ hasError: false });
  }

  render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children;
    return <ErrorFallback scope={this.props.scope} onRetry={() => this.setState({ hasError: false })} />;
  }
}
