import { useState } from "react";
import { api } from "../../api.js";

const DOCS = [
  { key: "panCard", label: "PAN card", accept: "image/*,.pdf" },
  { key: "aadhaarFront", label: "Aadhaar card (front)", accept: "image/*,.pdf" },
  { key: "selfie", label: "Selfie", accept: "image/*" },
  { key: "signature", label: "Signature", accept: "image/*" },
  { key: "cheque", label: "Cancelled cheque or bank statement", accept: "image/*,.pdf" },
];
const MAX = 2 * 1024 * 1024;

// Shown while KYC is rejected or under review: replace any of the documents
export default function KycUpload({ user, onUser, onToast }) {
  const [files, setFiles] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const pick = (key, e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX) return setError(`${DOCS.find((d) => d.key === key).label}: file is larger than 2 MB.`);
    setError("");
    setFiles((f) => ({ ...f, [key]: file }));
  };

  const upload = async () => {
    const chosen = Object.entries(files);
    if (!chosen.length) return setError("Choose at least one document.");
    const form = new FormData();
    chosen.forEach(([k, file]) => form.append(k, file, file.name));
    setBusy(true);
    try {
      const res = await api("/me/kyc/documents", { method: "POST", form });
      setFiles({});
      onUser(res.user);
      onToast("Documents uploaded. We'll review your KYC again shortly.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="money-panel">
      <div className="panel-head">
        <h3>{user.kyc === "rejected" ? "Fix your KYC" : "Update KYC documents"}</h3>
      </div>
      {user.kycNote && (
        <p className="error">Reason from our team: {user.kycNote}</p>
      )}
      <p className="muted small">Upload clear, uncropped files (JPG, PNG, WebP or PDF, up to 2 MB each). Only the ones you choose are replaced.</p>
      {DOCS.map((d) => (
        <div key={d.key} className="panel-actions" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <span>
            {d.label}
            <small className="muted"> · {files[d.key] ? `✓ ${files[d.key].name}` : user.documents.includes(d.key) ? "uploaded" : "missing"}</small>
          </span>
          <label className="btn outline" style={{ cursor: "pointer" }}>
            {files[d.key] ? "Change" : "Choose file"}
            <input type="file" hidden accept={d.accept} onChange={(e) => pick(d.key, e)} />
          </label>
        </div>
      ))}
      {error && <span className="error">{error}</span>}
      <div className="panel-actions">
        <button type="button" className="btn solid" onClick={upload} disabled={busy}>
          {busy ? "Uploading…" : "Upload and send for review"}
        </button>
      </div>
    </section>
  );
}
