import { Field } from "@/components/Common";
import { PHONE_RE, PIN_RE } from "@/lib/api";

export const STATES = ["Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"];

export const EMPTY_ADDR = { name: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "" };

export function validateAddress(a) {
  const e = {};
  if (!a.name || a.name.trim().length < 2) e.name = "Please enter the full name.";
  if (!PHONE_RE.test((a.phone || "").replace(/\s/g, ""))) e.phone = "Enter a valid 10-digit Indian mobile number.";
  if (!a.line1 || a.line1.trim().length < 3) e.line1 = "Please enter the address.";
  if (!a.city || a.city.trim().length < 2) e.city = "Please enter the city.";
  if (!a.state) e.state = "Please choose a state.";
  if (!PIN_RE.test(a.pincode || "")) e.pincode = "Enter a valid 6-digit PIN code.";
  return e;
}

export function AddressForm({ value, onChange, errors = {}, prefix }) {
  const set = (k) => (e) => onChange({ ...value, [k]: k === "pincode" ? e.target.value.replace(/\D/g, "").slice(0, 6) : e.target.value });
  const input = (k, label, props = {}) => (
    <Field label={label} id={`${prefix}-${k}`} error={errors[k]}>
      <input id={`${prefix}-${k}`} value={value[k] || ""} onChange={set(k)} className="input-luxe" aria-invalid={!!errors[k]} aria-describedby={errors[k] ? `${prefix}-${k}-error` : undefined} data-testid={`${prefix}-${k}-input`} {...props} />
    </Field>
  );
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="sm:col-span-2">{input("name", "Full name", { autoComplete: "name", maxLength: 80 })}</div>
      <div className="sm:col-span-2">{input("phone", "Mobile number", { autoComplete: "tel", inputMode: "tel", maxLength: 14, placeholder: "10-digit mobile" })}</div>
      <div className="sm:col-span-2">{input("line1", "Address", { autoComplete: "address-line1", maxLength: 160, placeholder: "House no., building, street" })}</div>
      <div className="sm:col-span-2">{input("line2", "Apartment, landmark (optional)", { autoComplete: "address-line2", maxLength: 160 })}</div>
      {input("city", "City", { autoComplete: "address-level2", maxLength: 60 })}
      {input("pincode", "PIN code", { autoComplete: "postal-code", inputMode: "numeric" })}
      <div className="sm:col-span-2">
        <Field label="State" id={`${prefix}-state`} error={errors.state}>
          <select id={`${prefix}-state`} value={value.state || ""} onChange={set("state")} className="input-luxe appearance-none" aria-invalid={!!errors.state} data-testid={`${prefix}-state-select`}>
            <option value="">Select state</option>
            {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
      </div>
    </div>
  );
}
