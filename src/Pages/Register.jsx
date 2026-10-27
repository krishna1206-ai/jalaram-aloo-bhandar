import { useState } from "react";
import { Link } from "react-router-dom";
import "./Register.css";

/* ---------- Data ---------- */
const steps = ["Verify", "Profile", "Address", "Docs", "Payout Account", "Nominee", "Security"];

const states = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat",
  "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan",
  "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
];

const identityDocs = [
  { key: "panCard", label: "PAN card", hint: "Front side · JPG, PNG or PDF", accept: "image/*,.pdf" },
  { key: "aadhaarFront", label: "Aadhaar card (front)", hint: "Mask the first 8 digits", accept: "image/*,.pdf" },
  { key: "selfie", label: "Selfie", hint: "Clear photo of your face", accept: "image/*", capture: "user" },
  { key: "signature", label: "Signature", hint: "Sign on white paper", accept: "image/*" },
];

const bankDocs = [
  { key: "cheque", label: "Cancelled cheque or bank statement", hint: "Must show your name and IFSC", accept: "image/*,.pdf" },
];

const initialForm = {
  website: "",
  // Step 1
  mobile: "", email: "",
  // Step 2
  fullName: "", pan: "", dob: "", gender: "", maritalStatus: "", fatherName: "",
  occupation: "", income: "", experience: "", pep: "no", taxResident: false,
  // Step 3
  aadhaarLast4: "", address: "", city: "", pincode: "", state: "",
  // Step 5
  accountHolder: "", accountNumber: "", confirmAccountNumber: "", ifsc: "", accountType: "", upi: "",
  // Step 6
  nomineeName: "", nomineeRelation: "", nomineeDob: "", guardianName: "", guardianRelation: "",
  // Step 7
  password: "", confirmPassword: "", pin: "", confirmPin: "",
  riskAck: false, dataConsent: false, terms: false, marketing: false,
};

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
const DEMO_OTP = "123456";

/* ---------- Helpers ---------- */
const toISO = (d) => d.toISOString().split("T")[0];
const today = toISO(new Date());
const maxDob = (() => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return toISO(d);
})();

function ageFrom(dateString) {
  if (!dateString) return null;
  const birth = new Date(dateString);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

function passwordRules(pw) {
  return [
    { label: "At least 8 characters", ok: pw.length >= 8 },
    { label: "One uppercase letter", ok: /[A-Z]/.test(pw) },
    { label: "One lowercase letter", ok: /[a-z]/.test(pw) },
    { label: "One number", ok: /\d/.test(pw) },
    { label: "One special character", ok: /[^A-Za-z0-9]/.test(pw) },
  ];
}

function passwordStrength(pw) {
  if (!pw) return { level: 0, label: "" };
  const score = passwordRules(pw).filter((r) => r.ok).length;
  const level = Math.max(1, Math.min(4, score - 1));
  return { level, label: ["", "Weak", "Fair", "Good", "Strong"][level] };
}

/* ---------- Reusable upload row ---------- */
function UploadRow({ doc, file, error, onFile, onRemove }) {
  return (
    <div className="upload">
      <div>
        <strong>{doc.label}</strong>
        <small>{doc.hint}</small>
      </div>
      {file ? (
        <div className="upload-done">
          <span className="file-name">✓ {file.name}</span>
          <button type="button" className="link" onClick={() => onRemove(doc.key)}>Remove</button>
        </div>
      ) : (
        <label className="upload-btn">
          Choose file
          <input
            type="file"
            hidden
            accept={doc.accept}
            capture={doc.capture}
            onChange={(e) => onFile(doc.key, e)}
          />
        </label>
      )}
      {error && <span className="error">{error}</span>}
    </div>
  );
}

/* ---------- Page ---------- */
function Register() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initialForm);

  const [otp, setOtp] = useState({
    mobile: { sent: false, verified: false, code: "", error: "" },
    email: { sent: false, verified: false, code: "", error: "" },
  });

  const [files, setFiles] = useState({});
  const [fileErrors, setFileErrors] = useState({});

  const [showAccount, setShowAccount] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [bankBusy, setBankBusy] = useState(false);
  const [bankVerified, setBankVerified] = useState(false);

  const [message, setMessage] = useState("");

  /* Form field helpers */
  const set = (name, value) => setForm((f) => ({ ...f, [name]: value }));
  const bind = (name) => ({ value: form[name], onChange: (e) => set(name, e.target.value) });
  const bindDigits = (name) => ({ value: form[name], onChange: (e) => set(name, e.target.value.replace(/\D/g, "")) });
  const bindUpper = (name) => ({ value: form[name], onChange: (e) => set(name, e.target.value.toUpperCase()) });
  const bindCheck = (name) => ({ checked: form[name], onChange: (e) => set(name, e.target.checked) });
  const noPaste = { onPaste: (e) => e.preventDefault() };

  /* Step navigation */
  const goTo = (i) => {
    setStep(i);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const next = () => goTo(Math.min(step + 1, steps.length - 1));
  const back = () => goTo(Math.max(step - 1, 0));

  /* OTP (demo) */
  const updateOtp = (k, changes) => setOtp((o) => ({ ...o, [k]: { ...o[k], ...changes } }));
  const sendOtp = (k) => updateOtp(k, { sent: true, code: "", error: "" });
  const verifyOtp = (k) =>
    otp[k].code === DEMO_OTP
      ? updateOtp(k, { verified: true, error: "" })
      : updateOtp(k, { error: "Incorrect OTP. Please try again." });
  const otpButtonLabel = (k) => (otp[k].verified ? "Verified" : otp[k].sent ? "Resend" : "Send OTP");

  /* File upload */
  const onFile = (key, e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      setFileErrors((fe) => ({ ...fe, [key]: "File is larger than 2 MB." }));
      return;
    }
    setFileErrors((fe) => ({ ...fe, [key]: "" }));
    setFiles((f) => ({ ...f, [key]: file }));
  };
  const removeFile = (key) => setFiles((f) => ({ ...f, [key]: null }));

  const renderUploads = (docs) =>
    docs.map((d) => (
      <UploadRow
        key={d.key}
        doc={d}
        file={files[d.key]}
        error={fileErrors[d.key]}
        onFile={onFile}
        onRemove={removeFile}
      />
    ));

  /* Bank (demo) */
  const verifyBank = () => {
    setBankBusy(true);
    setTimeout(() => {
      setBankBusy(false);
      setBankVerified(true);
    }, 1200);
  };

  /* Submit */
  const onSubmit = (e) => {
    e.preventDefault();
    setMessage("Application submitted! We'll review your KYC and notify you shortly.");
  };

  const nomineeAge = ageFrom(form.nomineeDob);
  const nomineeIsMinor = nomineeAge !== null && nomineeAge < 18;
  const strength = passwordStrength(form.password);
  const pwRules = passwordRules(form.password);

  return (
    <div className="login-page">
      <Link to="/" className="back-link">← Back to home</Link>

      <div className="login-card register-card">
        <div className="login-brand">
          <span className="brand-mark">JA</span>
          <div>
            <strong>Jalaram Aloo Bhandar</strong>
            <small>COMMODITY MARKET</small>
          </div>
        </div>

        <h1>Open your account</h1>
        <p className="sub">Secure KYC in a few minutes to start trading potato, garlic and onion.</p>
        <p className="demo-badge">Preview mode · validation is off</p>

        {/* Stepper */}
        <ol className="stepper">
          {steps.map((s, i) => (
            <li key={s} className={i === step ? "active" : i < step ? "done" : ""}>
              <button type="button" onClick={() => goTo(i)}>
                <span className="dot">{i < step ? "✓" : i + 1}</span>
                <em>{s}</em>
              </button>
            </li>
          ))}
        </ol>

        <form onSubmit={onSubmit} noValidate autoComplete="off">
          {/* Hidden spam-trap field */}
          <div className="hp" aria-hidden="true">
            <label>
              Website <input type="text" tabIndex={-1} autoComplete="off" {...bind("website")} />
            </label>
          </div>

          {/* STEP 1: VERIFY */}
          {step === 0 && (
            <div>
              {["mobile", "email"].map((k) => (
                <div key={k}>
                  <label htmlFor={k}>{k === "mobile" ? "Mobile number" : "Email address"}</label>
                  <div className="inline-wrap">
                    <input
                      id={k}
                      type={k === "mobile" ? "tel" : "email"}
                      maxLength={k === "mobile" ? 10 : undefined}
                      placeholder={k === "mobile" ? "10-digit mobile number" : "name@example.com"}
                      readOnly={otp[k].verified}
                      autoComplete="off"
                      {...(k === "mobile" ? bindDigits(k) : bind(k))}
                    />
                    <button
                      type="button"
                      className="toggle"
                      onClick={() => sendOtp(k)}
                      disabled={otp[k].verified || !form[k]}
                    >
                      {otpButtonLabel(k)}
                    </button>
                  </div>

                  {otp[k].sent && !otp[k].verified && (
                    <div className="inline-wrap otp-row">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        autoComplete="one-time-code"
                        placeholder="Enter 6-digit OTP"
                        value={otp[k].code}
                        onChange={(e) => updateOtp(k, { code: e.target.value.replace(/\D/g, "") })}
                      />
                      <button
                        type="button"
                        className="toggle"
                        onClick={() => verifyOtp(k)}
                        disabled={otp[k].code.length !== 6}
                      >
                        Verify
                      </button>
                    </div>
                  )}
                  {otp[k].verified && <span className="ok">✓ Verified</span>}
                  {otp[k].error && <span className="error">{otp[k].error}</span>}
                </div>
              ))}
              <p className="hint">
                Demo mode: use OTP <strong>{DEMO_OTP}</strong>. No real SMS or email is sent.
              </p>
            </div>
          )}

          {/* STEP 2: PROFILE */}
          {step === 1 && (
            <div>
              <label htmlFor="fullName">
                Full name <span className="optional">(exactly as per PAN)</span>
              </label>
              <input id="fullName" type="text" placeholder="Name as on PAN card" {...bind("fullName")} />

              <div className="row">
                <div>
                  <label htmlFor="pan">PAN number</label>
                  <input id="pan" type="text" maxLength={10} placeholder="ABCDE1234F" {...bindUpper("pan")} />
                </div>
                <div>
                  <label htmlFor="dob">Date of birth</label>
                  <input id="dob" type="date" max={maxDob} {...bind("dob")} />
                </div>
              </div>

              <div className="row">
                <div>
                  <label htmlFor="gender">Gender</label>
                  <select id="gender" {...bind("gender")}>
                    <option value="">Select</option>
                    <option>Male</option>
                    <option>Female</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="maritalStatus">Marital status</label>
                  <select id="maritalStatus" {...bind("maritalStatus")}>
                    <option value="">Select</option>
                    <option>Single</option>
                    <option>Married</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>

              <label htmlFor="fatherName">Father's name</label>
              <input id="fatherName" type="text" placeholder="Father's full name" {...bind("fatherName")} />

              <div className="row">
                <div>
                  <label htmlFor="occupation">Occupation</label>
                  <select id="occupation" {...bind("occupation")}>
                    <option value="">Select</option>
                    <option>Salaried</option>
                    <option>Self-employed</option>
                    <option>Business</option>
                    <option>Commodity trader</option>
                    <option>Farmer</option>
                    <option>Student</option>
                    <option>Retired</option>
                    <option>Homemaker</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="income">Annual income</label>
                  <select id="income" {...bind("income")}>
                    <option value="">Select</option>
                    <option>Below ₹5 lakh</option>
                    <option>₹5-10 lakh</option>
                    <option>₹10-25 lakh</option>
                    <option>Above ₹25 lakh</option>
                  </select>
                </div>
              </div>

              <label htmlFor="experience">Trading experience</label>
              <select id="experience" {...bind("experience")}>
                <option value="">Select</option>
                <option>Beginner</option>
                <option>1-3 years</option>
                <option>3+ years</option>
              </select>

              <label>Are you a politically exposed person (PEP) or related to one?</label>
              <div className="chips">
                <label className="chip">
                  <input type="radio" name="pep" value="no" checked={form.pep === "no"} onChange={() => set("pep", "no")} /> No
                </label>
                <label className="chip">
                  <input type="radio" name="pep" value="yes" checked={form.pep === "yes"} onChange={() => set("pep", "yes")} /> Yes
                </label>
              </div>
              {form.pep === "yes" && (
                <p className="hint">Additional verification will be required before your account is activated.</p>
              )}

              <label className="checkbox-row" htmlFor="taxResident">
                <input id="taxResident" type="checkbox" {...bindCheck("taxResident")} />
                <span>I declare that I am a resident of India for tax purposes only.</span>
              </label>
            </div>
          )}

          {/* STEP 3: ADDRESS */}
          {step === 2 && (
            <div>
              <button type="button" className="btn-secondary digilocker" disabled>
                Fetch details via DigiLocker (coming soon)
              </button>
              <p className="hint">For your safety we never ask for your full Aadhaar number, only the last 4 digits.</p>

              <label htmlFor="aadhaarLast4">Aadhaar (last 4 digits)</label>
              <input id="aadhaarLast4" type="password" inputMode="numeric" maxLength={4} placeholder="••••" {...bindDigits("aadhaarLast4")} />

              <label htmlFor="address">Address</label>
              <input id="address" type="text" autoComplete="street-address" placeholder="House no., street, area" {...bind("address")} />

              <div className="row">
                <div>
                  <label htmlFor="city">City</label>
                  <input id="city" type="text" placeholder="City" {...bind("city")} />
                </div>
                <div>
                  <label htmlFor="pincode">Pincode</label>
                  <input id="pincode" type="text" inputMode="numeric" maxLength={6} placeholder="6-digit pincode" {...bindDigits("pincode")} />
                </div>
              </div>

              <label htmlFor="state">State</label>
              <select id="state" {...bind("state")}>
                <option value="">Select state</option>
                {states.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
          )}

          {/* STEP 4: DOCUMENTS */}
          {step === 3 && (
            <div>
              <p className="hint">Upload clear, uncropped images. Files are checked for type and size (max 2 MB each).</p>
              {renderUploads(identityDocs)}
            </div>
          )}

          {/* STEP 5: BANK */}
          {step === 4 && (
            <div>
              <p className="hint">Payouts are sent only to a bank account in your own name.</p>

              <label htmlFor="accountHolder">Account holder name</label>
              <input id="accountHolder" type="text" placeholder="Name as per bank account" {...bind("accountHolder")} />

              <label htmlFor="accountNumber">Bank account number</label>
              <div className="inline-wrap">
                <input
                  id="accountNumber"
                  type={showAccount ? "text" : "password"}
                  inputMode="numeric"
                  maxLength={18}
                  placeholder="Account number"
                  {...bindDigits("accountNumber")}
                />
                <button type="button" className="toggle" onClick={() => setShowAccount(!showAccount)}>
                  {showAccount ? "Hide" : "Show"}
                </button>
              </div>

              <label htmlFor="confirmAccountNumber">Confirm account number</label>
              <input
                id="confirmAccountNumber"
                type="text"
                inputMode="numeric"
                maxLength={18}
                placeholder="Re-enter account number"
                {...bindDigits("confirmAccountNumber")}
                {...noPaste}
              />
              {form.confirmAccountNumber && form.confirmAccountNumber !== form.accountNumber && (
                <span className="error">Account numbers do not match.</span>
              )}

              <div className="row">
                <div>
                  <label htmlFor="ifsc">IFSC code</label>
                  <input id="ifsc" type="text" maxLength={11} placeholder="SBIN0001234" {...bindUpper("ifsc")} />
                </div>
                <div>
                  <label htmlFor="accountType">Account type</label>
                  <select id="accountType" {...bind("accountType")}>
                    <option value="">Select</option>
                    <option>Savings</option>
                    <option>Current</option>
                  </select>
                </div>
              </div>

              <label htmlFor="upi">
                UPI ID <span className="optional">(optional)</span>
              </label>
              <input id="upi" type="text" placeholder="name@bank" {...bind("upi")} />

              {renderUploads(bankDocs)}

              <button
                type="button"
                className="btn-secondary verify-bank"
                onClick={verifyBank}
                disabled={bankBusy || bankVerified}
              >
                {bankBusy ? "Verifying…" : bankVerified ? "Bank account verified ✓" : "Verify bank account"}
              </button>
            </div>
          )}

          {/* STEP 6: NOMINEE */}
          {step === 5 && (
            <div>
              <label htmlFor="nomineeName">Nominee full name</label>
              <input id="nomineeName" type="text" placeholder="Nominee's full name" {...bind("nomineeName")} />

              <div className="row">
                <div>
                  <label htmlFor="nomineeRelation">Relationship</label>
                  <select id="nomineeRelation" {...bind("nomineeRelation")}>
                    <option value="">Select</option>
                    <option>Spouse</option>
                    <option>Parent</option>
                    <option>Child</option>
                    <option>Sibling</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="nomineeDob">Nominee date of birth</label>
                  <input id="nomineeDob" type="date" max={today} {...bind("nomineeDob")} />
                </div>
              </div>

              {nomineeIsMinor && (
                <>
                  <p className="hint">The nominee is under 18, so a guardian is required.</p>
                  <div className="row">
                    <div>
                      <label htmlFor="guardianName">Guardian name</label>
                      <input id="guardianName" type="text" placeholder="Guardian's full name" {...bind("guardianName")} />
                    </div>
                    <div>
                      <label htmlFor="guardianRelation">Guardian relation</label>
                      <select id="guardianRelation" {...bind("guardianRelation")}>
                        <option value="">Select</option>
                        <option>Parent</option>
                        <option>Legal guardian</option>
                        <option>Other</option>
                      </select>
                    </div>
                  </div>
                </>
              )}
              <p className="hint">Nominee share: 100%</p>
            </div>
          )}

          {/* STEP 7: SECURITY */}
          {step === 6 && (
            <div>
              <label htmlFor="password">Create password</label>
              <div className="inline-wrap">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Create a strong password"
                  {...bind("password")}
                />
                <button type="button" className="toggle" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <div className={`meter l${strength.level}`}>
                <i></i><i></i><i></i><i></i>
              </div>
              {strength.label && <span className="meter-label">Password strength: {strength.label}</span>}
              <ul className="rules">
                {pwRules.map((r) => (
                  <li key={r.label} className={r.ok ? "pass" : ""}>{r.label}</li>
                ))}
              </ul>

              <label htmlFor="confirmPassword">Confirm password</label>
              <input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Re-enter password"
                {...bind("confirmPassword")}
                {...noPaste}
              />
              {form.confirmPassword && form.confirmPassword !== form.password && (
                <span className="error">Passwords do not match.</span>
              )}

              <div className="row">
                <div>
                  <label htmlFor="pin">Transaction PIN (6 digits)</label>
                  <input id="pin" type="password" inputMode="numeric" maxLength={6} placeholder="••••••" {...bindDigits("pin")} />
                </div>
                <div>
                  <label htmlFor="confirmPin">Confirm PIN</label>
                  <input
                    id="confirmPin"
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="••••••"
                    {...bindDigits("confirmPin")}
                    {...noPaste}
                  />
                  {form.confirmPin && form.confirmPin !== form.pin && (
                    <span className="error">PINs do not match.</span>
                  )}
                </div>
              </div>
              <p className="hint">You'll use this PIN to confirm every buy, sell and withdrawal.</p>

              <label className="checkbox-row" htmlFor="riskAck">
                <input id="riskAck" type="checkbox" {...bindCheck("riskAck")} />
                <span>I understand that commodity prices can fall and I may lose part or all of my investment.</span>
              </label>

              <label className="checkbox-row" htmlFor="dataConsent">
                <input id="dataConsent" type="checkbox" {...bindCheck("dataConsent")} />
                <span>I consent to the collection and processing of my personal and KYC data as described in the privacy policy.</span>
              </label>

              <label className="checkbox-row" htmlFor="terms">
                <input id="terms" type="checkbox" {...bindCheck("terms")} />
                <span>
                  I agree to the{" "}
                  <Link className="inline-link" to="/terms" target="_blank" rel="noopener">
                    terms and conditions
                  </Link>
                  .
                </span>
              </label>

              <label className="checkbox-row" htmlFor="marketing">
                <input id="marketing" type="checkbox" {...bindCheck("marketing")} />
                <span>
                  Send me price alerts and updates by SMS, WhatsApp and email <span className="optional">(optional)</span>.
                </span>
              </label>
            </div>
          )}

          <div className="nav-buttons">
            {step > 0 && (
              <button type="button" className="btn-secondary back" onClick={back}>
                ← Back
              </button>
            )}
            {step < steps.length - 1 ? (
              <button type="button" className="btn-primary next" onClick={next}>
                Continue <span>↗</span>
              </button>
            ) : (
              <button type="submit" className="btn-primary next">
                Submit application <span>↗</span>
              </button>
            )}
          </div>

          {message && <p className="success">{message}</p>}

          <p className="switch-text">
            Already have an account? <Link to="/login">Login</Link>
          </p>
        </form>
      </div>
    </div>
  );
}

export default Register;