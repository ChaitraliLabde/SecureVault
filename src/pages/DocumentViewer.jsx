import { ArrowLeft, Download, History, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, getToken } from "../api";
import Badge from "../components/Badge";
import { useApp } from "../context/AppContext";
import { hasPermission } from "../lib/roleAccess";

export default function DocumentViewer() {
  const { id } = useParams();
  const { notify, user } = useApp();
  const navigate = useNavigate();
  const [doc, setDoc] = useState(null);
  const [result, setResult] = useState(null);
  const [localResult, setLocalResult] = useState(null);
  const [localFile, setLocalFile] = useState(null);
  const [tab, setTab] = useState("Document");
  const [recipients, setRecipients] = useState([]);
  const [recipientId, setRecipientId] = useState("");
  const [transferNote, setTransferNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileUrl = `/api/documents/${id}/file`;

  useEffect(() => {
    api(`/api/documents/${id}`)
      .then((d) => setDoc(d.document))
      .catch((e) => setError(e.message));
    if (hasPermission(user, "docs.upload")) {
      api(`/api/documents/${id}/custody-recipients`)
        .then((d) => setRecipients(d.users))
        .catch((e) => setError(e.message));
    }
  }, [id]);

  const verify = async () => {
    setError("");
    setBusy(true);
    try {
      const data = await api(`/api/documents/${id}/verify`, { method: "POST", body: {} });
      setResult(data);
      const detail = await api(`/api/documents/${id}`);
      setDoc(detail.document);
      notify(data.match ? "Integrity verified" : "Hash mismatch flagged");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const compareLocalFile = async () => {
    if (!localFile) return;
    setError("");
    setBusy(true);
    setLocalResult(null);
    try {
      const form = new FormData();
      form.append("file", localFile);
      const data = await api("/api/integrity/compare", { method: "POST", form });
      setLocalResult(data);
      notify(data.match ? "Local file matches registered evidence" : "Hash mismatch detected");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const transferCustody = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = await api(`/api/documents/${id}/custody-transfer`, {
        method: "POST",
        body: { recipientId, note: transferNote },
      });
      setDoc(data.document);
      setRecipientId("");
      setTransferNote("");
      const updatedRecipients = await api(`/api/documents/${id}/custody-recipients`);
      setRecipients(updatedRecipients.users);
      notify("Evidence custody transferred");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    fetch(`${fileUrl}?download=1`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => {
        if (!r.ok) throw new Error("Download not permitted");
        return r.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = doc.name;
        a.click();
        notify("Secure download started");
      })
      .catch((e) => notify(e.message));
  };

  if (error && !doc) return <div className="card empty">{error}</div>;
  if (!doc) return <div className="empty">Loading document…</div>;
  const pdf = /\.pdf$/i.test(doc.name);
  const image = /\.(png|jpe?g)$/i.test(doc.name);
  const audio = /\.(webm|wav)$/i.test(doc.name);
  const text = /\.txt$/i.test(doc.name);

  return (
    <div className="viewer">
      <div className="page-head">
        <div>
          <button className="btn btn-ghost" onClick={() => navigate("/documents")}>
            <ArrowLeft size={16} /> Back to documents
          </button>
          <h1 style={{ marginTop: 14 }}>{doc.name}</h1>
          <p>
            {doc.caseId} · {doc.type} · {doc.uploadedByName} · {doc.uploadedOnLabel} ·{" "}
            {doc.currentVersion?.version}
          </p>
        </div>
        <div className="toolbar">
          <Badge status="Encrypted" />
          {hasPermission(user, "integrity.verify") ? (
            <button className="btn btn-ghost" onClick={verify} disabled={busy}>
              <ShieldCheck size={16} /> Verify Integrity
            </button>
          ) : null}
          <button className="btn btn-ghost" onClick={() => navigate(`/documents/${doc.id}/versions`)}>
            <History size={16} /> Versions
          </button>
          {hasPermission(user, "docs.download") ? (
            <button className="btn btn-primary" onClick={download}>
              <Download size={16} /> Download
            </button>
          ) : null}
        </div>
      </div>
      {result ? (
        <div className={`card card-pad ${result.match ? "ok-banner" : "warn-banner"}`} role="status">
          <strong>{result.match ? "VERIFIED / INTEGRITY MATCH" : "ALERT: TAMPERING DETECTED / HASH MISMATCH"}</strong>
          <p>{result.note}</p>
          <code>Recorded: {result.recorded}</code>
          <br />
          <code>Calculated: {result.calculated}</code>
        </div>
      ) : null}
      {error ? <div className="form-error card card-pad" role="alert" style={{ marginBottom: 16 }}>{error}</div> : null}
      {doc.isDerivative ? (
        <div className="card card-pad derivative-banner" role="note">
          <strong>DERIVATIVE DOCUMENT — NOT THE ORIGINAL EVIDENCE</strong>
          <p>This transcript is separately stored and hashed. It is associated with original audio document {doc.derivativeOf}.</p>
        </div>
      ) : null}
      <div className="tabs">
        {["Document", "Chain of Custody"].map((item) => (
          <button key={item} className={`tab ${tab === item ? "active" : ""}`} onClick={() => setTab(item)}>{item}</button>
        ))}
      </div>
      {tab === "Document" ? (
      <div className="report-sheet">
        <div className="muted" style={{ textAlign: "center" }}>
          CONFIDENTIAL · {doc.caseId} · {doc.currentVersion?.sha256?.slice(0, 16)}…
        </div>
        {pdf ? (
            <AuthPdf src={fileUrl} title={doc.name} />
          ) : image ? (
            <AuthImage src={fileUrl} alt={doc.name} />
          ) : audio ? (
          <div className="document-audio">
            <h2>Protected Original Audio Evidence</h2>
            <p className="muted">SHA-256 baseline: <code className="hash">{doc.originalSha256 || doc.currentVersion?.sha256}</code></p>
            <AuthAudio src={fileUrl} />
            {(doc.derivativeDocumentIds || []).length ? (
              <div className="derivative-panel">
                <strong>Related transcript derivatives</strong>
                {(doc.derivativeDocumentIds || []).map((documentId) => (
                  <button key={documentId} className="btn btn-ghost" type="button" onClick={() => navigate(`/documents/${documentId}`)}>
                    View derivative {documentId}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : text ? (
          <div className="document-text">
            <h2>Derivative Transcript / Notes</h2>
            <AuthText src={fileUrl} />
          </div>
        ) : (
          <>
            <h2>{(doc.type || "DOCUMENT").toUpperCase()}</h2>
            <p>
              <strong>Title:</strong> {doc.title}
            </p>
            <p>{doc.description || "No description provided."}</p>
            <h3>Chain of custody</h3>
            <p>
              This file is stored in private SecureVault storage. Each version keeps its original
              SHA-256 digest. Integrity verification recalculates that digest and compares it with
              the recorded value.
            </p>
          </>
        )}
      </div>
      ) : (
        <div className="card card-pad">
          <h2 className="card-title">Chain of Custody Timeline</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Handler Name</th>
                  <th>Role</th>
                  <th>Timestamp</th>
                  <th>Action Performed</th>
                  <th>IP Address</th>
                  <th>Cryptographic Hash</th>
                </tr>
              </thead>
              <tbody>
                {(doc.custodyEvents || []).map((event) => (
                  <tr key={event.id}>
                    <td>{event.handlerName}</td>
                    <td>{event.role}</td>
                    <td>{new Date(event.timestamp).toLocaleString()}</td>
                    <td title={event.note || ""}>{event.action}{event.note ? ` · ${event.note}` : ""}</td>
                    <td>{event.ipAddress}</td>
                    <td><code className="hash">{event.sha256 || "—"}</code></td>
                  </tr>
                ))}
                {!(doc.custodyEvents || []).length ? <tr><td colSpan="6">No custody events are recorded yet.</td></tr> : null}
              </tbody>
            </table>
          </div>
          {hasPermission(user, "integrity.verify") ? (
            <section style={{ marginTop: 24 }}>
              <h3>Compare a local file copy</h3>
              <p className="muted">The file is compared in memory and is not stored.</p>
              <div className="field">
                <label htmlFor="document-local-file">Select a local file</label>
                <input id="document-local-file" className="input" type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={(e) => { setLocalFile(e.target.files?.[0] || null); setLocalResult(null); }} />
              </div>
              <button className="btn btn-ghost" type="button" disabled={!localFile || busy} onClick={compareLocalFile}>
                <ShieldCheck size={16} /> {busy ? "Comparing…" : "Compare Local File"}
              </button>
              {localResult ? (
                <div className={`verify-box ${localResult.match ? "ok-banner" : "warn-banner"}`} role="status" style={{ marginTop: 16 }}>
                  <strong>{localResult.note}</strong>
                  <p>{localResult.fileName} · {new Date(localResult.checkedAt).toLocaleString()}</p>
                  <code className="hash">{localResult.calculated}</code>
                  {localResult.matches.map((match) => <p key={`${match.documentId}-${match.version}`}>{match.document} · {match.version}</p>)}
                </div>
              ) : null}
            </section>
          ) : null}
          {hasPermission(user, "docs.upload") ? (
            <form onSubmit={transferCustody} style={{ marginTop: 24 }}>
              <h3>Transfer Custody</h3>
              <p className="muted">Transfer custody to an active user authorized for this case. Original file versions and hashes are preserved.</p>
              <div className="field">
                <label htmlFor="custody-recipient">New custodian</label>
                <select id="custody-recipient" className="select" required value={recipientId} onChange={(e) => setRecipientId(e.target.value)}>
                  <option value="">Select an authorized user</option>
                  {recipients.filter((recipient) => recipient.id !== user.id).map((recipient) => (
                    <option key={recipient.id} value={recipient.id}>{recipient.name} · {recipient.role}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="custody-note">Transfer note (optional)</label>
                <input id="custody-note" className="input" value={transferNote} maxLength={1000} onChange={(e) => setTransferNote(e.target.value)} />
              </div>
              <button className="btn btn-primary" type="submit" disabled={busy || !recipientId}>Record Custody Transfer</button>
            </form>
          ) : null}
        </div>
      )}
    </div>
  );
}

function AuthImage({ src, alt }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    fetch(src, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => r.blob())
      .then((b) => setUrl(URL.createObjectURL(b)));
  }, [src]);
  if (!url) return <p>Loading preview…</p>;
  return <img src={url} alt={alt} style={{ maxHeight: 520, margin: "24px auto", display: "block" }} />;
}

function AuthAudio({ src }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    fetch(src, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((response) => {
        if (!response.ok) throw new Error("Audio preview is not available");
        return response.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (active) setUrl(objectUrl);
      })
      .catch((previewError) => { if (active) setError(previewError.message); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);
  if (error) return <p className="form-error" role="alert">{error}</p>;
  if (!url) return <p>Loading audio preview…</p>;
  return <audio controls src={url} aria-label="Original audio evidence preview" />;
}

function AuthText({ src }) {
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch(src, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((response) => {
        if (!response.ok) throw new Error("Transcript preview is not available");
        return response.text();
      })
      .then((value) => { if (active) setContent(value); })
      .catch((previewError) => { if (active) setError(previewError.message); });
    return () => { active = false; };
  }, [src]);
  if (error) return <p className="form-error" role="alert">{error}</p>;
  if (!content) return <p>Loading transcript…</p>;
  return <pre className="transcript-content">{content}</pre>;
}
function AuthPdf({ src, title }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl = "";

    fetch(src, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("PDF preview could not be loaded");
        }

        return response.blob();
      })
      .then((blob) => {
        const pdfBlob = new Blob([blob], {
          type: "application/pdf",
        });

        objectUrl = URL.createObjectURL(pdfBlob);

        if (active) {
          setUrl(objectUrl);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.message);
        }
      });

    return () => {
      active = false;

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [src]);

  if (error) {
    return (
      <p className="form-error" role="alert">
        {error}
      </p>
    );
  }

  if (!url) {
    return <p>Loading PDF preview...</p>;
  }

  return (
    <iframe
      src={url}
      title={title}
      style={{
        width: "100%",
        height: "750px",
        border: "none",
        borderRadius: "8px",
        marginTop: "20px",
      }}
    />
  );
}
