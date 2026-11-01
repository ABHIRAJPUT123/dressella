import { Link } from "react-router-dom";

export const Logo = ({ className = "", testid = "header-logo-link" }) => (
  <Link to="/" className={`inline-flex items-center ${className}`} aria-label="DRESSELLA home" data-testid={testid}>
    <span className="font-display text-[22px] leading-none tracking-[0.26em] sm:text-[30px] sm:tracking-[0.34em]">DRESSELLA</span>
  </Link>
);
