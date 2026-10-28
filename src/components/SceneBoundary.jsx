import React from 'react';

// Catches model fetch, parsing and renderer initialization failures.
// The parent keeps an accessible static poster beneath the Canvas.
export default class SceneBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error) { this.props.onFailure?.(error?.message || '3D renderer failed'); }
  render() { return this.state.hasError ? null : this.props.children; }
}
