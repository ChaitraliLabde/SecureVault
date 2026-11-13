import { ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import Badge from "../components/Badge";
import { useApp } from "../context/AppContext";

export default function Integrity() {
  const { notify } = useApp();
  const [docs, setDocs] = useState([]);
  const [id, setId] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [localFile, setLocalFile] = useState(null);
  const [compareResult, setCompareResult] = useState(null);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    api("/api/documents").then((d) => {
      setDocs(d.documents);
      setId(d.documents[0]?.id || "");
    }).catch((err) => setError(err.message));
  }, []);

  const verify = async () => {
    setError("");
    setVerifying(true);
    try {
      const data = await api(`/api/documents/${id}/verify`, { method: "POST", body: {} });
      setResult(data);
      notify(data.match ? "Hash match" : "Mismatch flagged for review");
    } catch (err) {
      setError(err.message);
    } finally {
      setVerifying(false);
    }
  };

  const compareLocalFile = async () => {
    if (!localFile) return;
    setError("");
    setComparing(true);
    setCompareResult(null);
    try {
      const form = new FormData();
      form.append("file", localFile);
      const data = await api("/api/integrity/compare", { method: "POST", form });
      setCompareResult(data);
      notify(data.match ? "Local file matches registered evidence" : "Hash mismatch detected");
    } catch (err) {
      setError(err.message);
    } finally {
      setComparing(false);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Integrity Verification</h1>
          <p>
            Recalculate SHA-256 of the stored file and compare it with the digest recorded at
            upload. A match supports integrity checking; it does not independently prove original
            authorship or truthfulness.
          </p>
        </div>
      </div>
      <div className="card card-pad" style={{ maxWidth: 720 }}>
        {docs.length ? (
          <div className="field">
            <label htmlFor="integrity-document">Select an authorized document</label>
            <select
              id="integrity-document"
              className="select"
              value={id}
              onChange={(e) => setId(e.target.value)}
            >
              {docs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.caseId} · {d.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="integrity-empty" role="status">
            <strong>No authorized documents available</strong>
            <span>Documents linked to cases assigned to your account will appear here.</span>
          </div>
        )}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="btn btn-primary" onClick={verify} disabled={!id || verifying}>
          <ShieldCheck size={16} /> {verifying ? "Verifying…" : "Verify Integrity"}
        </button>
        {result ? (
          <div className={`verify-box ${result.match ? "ok-banner" : "warn-banner"}`}>
            <strong>{result.match ? "VERIFIED / INTEGRITY MATCH" : "ALERT: TAMPERING DETECTED / HASH MISMATCH"}</strong>
            <p><Badge status={result.match ? "Verified" : "Mismatch"} /></p>
            <p>{result.note}</p>
            <p>
              <strong>Verified at:</strong> {new Date(result.verifiedAt).toLocaleString()}
            </p>
            <p>
              <strong>Version:</strong> {result.version}
            </p>
            <p>
              Recorded hash
              <br />
              <code className="hash">{result.recorded}</code>
            </p>
            <p>
              Recalculated hash
              <br />
              <code className="hash">{result.calculated}</code>
            </p>
          </div>
        ) : null}
        <hr style={{ margin: "24px 0", borderColor: "var(--line)" }} />
        <div className="card-title">Compare a local file copy</div>
        <p className="muted">The file is checked in memory against registered document versions in your authorized case scope; it is not stored.</p>
        <div className="field">
          <label htmlFor="integrity-local-file">Select a local document</label>
          <input
            id="integrity-local-file"
            className="input"
            type="file"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
            onChange={(e) => { setLocalFile(e.target.files?.[0] || null); setCompareResult(null); }}
          />
        </div>
        <button className="btn btn-ghost compare-local-file" type="button" onClick={compareLocalFile} disabled={!localFile || comparing}>
          <ShieldCheck size={16} /> {comparing ? "Comparing…" : "Compare Local File"}
        </button>
        {compareResult ? (
          <div className={`verify-box ${compareResult.match ? "ok-banner" : "warn-banner"}`} role="status" style={{ marginTop: 16 }}>
            <strong>{compareResult.note}</strong>
            <p>Checked: {compareResult.fileName} · {new Date(compareResult.checkedAt).toLocaleString()}</p>
            <p>Calculated SHA-256<br /><code className="hash">{compareResult.calculated}</code></p>
            {compareResult.matches.map((match) => (
              <p key={`${match.documentId}-${match.version}`}>
                Matched: {match.caseId} · {match.document} · {match.version}<br />
                Registered SHA-256<br /><code className="hash">{match.recorded}</code>
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
