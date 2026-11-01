import { Link } from "react-router-dom";

export const Logo = ({ className = "", testid = "header-logo-link" }) => (
  <Link to="/" className={`inline-flex items-center ${className}`} aria-label="DRESSELLA home" data-testid={testid}>
    <span className="font-serif text-lg tracking-[0.2em] sm:text-2xl sm:tracking-[0.3em]">DRESSELLA</span>
  </Link>
);
