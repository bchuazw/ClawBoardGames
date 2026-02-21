"use client";
import React from "react";

export default class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("ClawMate error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h2>Something went wrong</h2>
          <p className="text-dim">{this.state.error?.message || "An error occurred."}</p>
          {this.props.onReset && (
            <button type="button" className="btn" onClick={() => { this.setState({ hasError: false, error: null }); this.props.onReset?.(); }}>
              Go back
            </button>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
