import { Component } from "react";
import { Link } from "react-router-dom";
import { useSeo } from "@/lib/seo";

export default function NotFound() {
  useSeo({ title: "Page not found", noindex: true });
  return (
    <div className="container-luxe grid min-h-[60vh] place-items-center py-20 text-center" data-testid="not-found-page">
      <div>
        <p className="eyebrow">404</p>
        <h1 className="mt-4 text-5xl sm:text-6xl">This page has moved on</h1>
        <p className="mx-auto mt-4 max-w-md text-sm text-taupe">The page you're looking for doesn't exist or is no longer available.</p>
        <div className="mt-10 flex justify-center gap-3"><Link to="/" className="btn-primary">Return home</Link><Link to="/shop" className="btn-outline">Shop all</Link></div>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { if (process.env.NODE_ENV !== "production") console.error("UI error", error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="grid min-h-screen place-items-center bg-ivory p-8 text-center" data-testid="error-state">
        <div>
          <p className="font-serif text-3xl tracking-[0.3em]">DRESSELLA</p>
          <h1 className="mt-8 font-serif text-4xl">We'll be right back</h1>
          <p className="mx-auto mt-4 max-w-md text-sm text-taupe">Something unexpected happened, or we're briefly down for maintenance. Your bag is saved on this device.</p>
          <button className="btn-primary mt-8" onClick={() => window.location.reload()}>Try again</button>
        </div>
      </div>
    );
  }
}
