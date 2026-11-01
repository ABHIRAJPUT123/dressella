import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { api, errMsg, EMAIL_RE } from "@/lib/api";
import { useSeo } from "@/lib/seo";
import { useAuth } from "@/context/AuthContext";
import { Field } from "@/components/Common";

const Shell = ({ title, sub, children }) => (
  <div className="container-luxe grid min-h-[70vh] place-items-center py-16">
    <div className="w-full max-w-md">
      <h1 className="text-center text-4xl sm:text-5xl">{title}</h1>
      {sub && <p className="mt-3 text-center text-sm text-taupe">{sub}</p>}
      <div className="mt-10">{children}</div>
    </div>
  </div>
);

const Input = ({ id, label, error, type, ...p }) => {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const VisibilityIcon = showPassword ? EyeOff : Eye;

  return (
    <Field label={label} id={id} error={error}>
      <div className={isPassword ? "relative" : undefined}>
        <input id={id} type={isPassword && showPassword ? "text" : type} className={`input-luxe${isPassword ? " pr-11" : ""}`} aria-invalid={!!error} data-testid={`${id}-input`} {...p} />
        {isPassword && (
          <button
            type="button"
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-taupe hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            aria-controls={id}
            data-testid={`${id}-toggle-visibility`}
          >
            <VisibilityIcon size={18} aria-hidden="true" />
          </button>
        )}
      </div>
    </Field>
  );
};

const safeNext = (n) => (n && n.startsWith("/") && !n.startsWith("//") ? n : null);

export function Login() {
  useSeo({ title: "Sign in", noindex: true });
  const { user, login } = useAuth();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const [f, setF] = useState({ email: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={safeNext(sp.get("next")) || (user.role === "admin" || user.role === "staff" ? "/admin" : "/account")} replace />;
  const submit = async (e) => {
    e.preventDefault();
    if (!EMAIL_RE.test(f.email) || !f.password) return setErr("Please enter your email and password.");
    setBusy(true); setErr("");
    try {
      const u = await login(f.email, f.password);
      nav(safeNext(sp.get("next")) || (u.role === "admin" || u.role === "staff" ? "/admin" : "/account"), { replace: true });
    } catch (e2) { setErr(errMsg(e2)); setBusy(false); }
  };
  return (
    <Shell title="Sign in" sub="Welcome back to DRESSELLA.">
      <form onSubmit={submit} noValidate className="space-y-5" data-testid="login-form">
        <Input id="login-email" label="Email" type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <Input id="login-password" label="Password" type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        {err && <p role="alert" className="text-sm text-destructive" data-testid="login-error">{err}</p>}
        <button className="btn-primary w-full" disabled={busy} data-testid="login-submit-button">{busy ? "Signing in…" : "Sign in"}</button>
        <div className="flex justify-between text-xs">
          <Link to="/forgot-password" className="underline" data-testid="forgot-password-link">Forgot password?</Link>
          <Link to={`/register${sp.get("next") ? `?next=${sp.get("next")}` : ""}`} className="underline" data-testid="register-link">Create an account</Link>
        </div>
      </form>
    </Shell>
  );
}

export function Register() {
  useSeo({ title: "Create account", noindex: true });
  const { user, register } = useAuth();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [errs, setErrs] = useState({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/account" replace />;
  const submit = async (e) => {
    e.preventDefault();
    const er = {};
    if (!f.name.trim()) er.name = "Please enter your name.";
    if (!EMAIL_RE.test(f.email)) er.email = "Please enter a valid email.";
    if (f.password.length < 8) er.password = "Password must be at least 8 characters.";
    setErrs(er);
    if (Object.keys(er).length) return;
    setBusy(true); setErr("");
    try { await register(f); nav(safeNext(sp.get("next")) || "/account", { replace: true }); } catch (e2) { setErr(errMsg(e2)); setBusy(false); }
  };
  return (
    <Shell title="Create account" sub="Save addresses, track orders and keep your wishlist across devices.">
      <form onSubmit={submit} noValidate className="space-y-5" data-testid="register-form">
        <Input id="register-name" label="Full name" autoComplete="name" value={f.name} error={errs.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Input id="register-email" label="Email" type="email" autoComplete="email" value={f.email} error={errs.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <Input id="register-password" label="Password" type="password" autoComplete="new-password" value={f.password} error={errs.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        {err && <p role="alert" className="text-sm text-destructive" data-testid="register-error">{err}</p>}
        <button className="btn-primary w-full" disabled={busy} data-testid="register-submit-button">{busy ? "Creating…" : "Create account"}</button>
        <p className="text-center text-xs">Already have an account? <Link to="/login" className="underline">Sign in</Link></p>
      </form>
    </Shell>
  );
}

export function ForgotPassword() {
  useSeo({ title: "Reset password", noindex: true });
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email)) return setMsg({ err: true, t: "Please enter a valid email." });
    try { const { data } = await api.post("/auth/forgot-password", { email }); setMsg({ t: data.message }); } catch (e2) { setMsg({ err: true, t: errMsg(e2) }); }
  };
  return (
    <Shell title="Forgot password" sub="Enter your email and we'll send you a reset link.">
      <form onSubmit={submit} noValidate className="space-y-5" data-testid="forgot-form">
        <Input id="forgot-email" label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        {msg && <p role={msg.err ? "alert" : "status"} className={`text-sm ${msg.err ? "text-destructive" : ""}`} data-testid="forgot-message">{msg.t}</p>}
        <button className="btn-primary w-full" data-testid="forgot-submit-button">Send reset link</button>
      </form>
    </Shell>
  );
}

export function ResetPassword() {
  useSeo({ title: "Choose a new password", noindex: true });
  const [sp] = useSearchParams();
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    if (pw.length < 8) return setMsg({ err: true, t: "Password must be at least 8 characters." });
    try { await api.post("/auth/reset-password", { token: sp.get("token") || "", password: pw }); setMsg({ ok: true, t: "Your password has been updated." }); } catch (e2) { setMsg({ err: true, t: errMsg(e2) }); }
  };
  return (
    <Shell title="New password">
      {msg?.ok ? <div className="text-center"><p role="status" data-testid="reset-success">{msg.t}</p><Link to="/login" className="btn-primary mt-6">Sign in</Link></div> : (
        <form onSubmit={submit} noValidate className="space-y-5" data-testid="reset-form">
          <Input id="reset-password" label="New password" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          {msg && <p role="alert" className="text-sm text-destructive" data-testid="reset-error">{msg.t}</p>}
          <button className="btn-primary w-full" data-testid="reset-submit-button">Update password</button>
        </form>
      )}
    </Shell>
  );
}
