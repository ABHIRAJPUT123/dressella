import { Link } from "react-router-dom";

export const Logo = ({ className = "", testid = "header-logo-link" }) => (
  <Link to="/" className={`inline-flex items-center ${className}`} aria-label="DRESSELLA home" data-testid={testid}>
    <span className="font-display text-[18px] leading-none tracking-[0.16em] min-[400px]:text-[20px] min-[400px]:tracking-[0.22em] sm:text-[30px] sm:tracking-[0.34em]">DRESSELLA</span>
  </Link>
);
