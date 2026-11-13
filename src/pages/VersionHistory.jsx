import { ArrowLeft, Download, Eye, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import { downloadAuthorized } from "../lib/download";
import { hasPermission } from "../lib/roleAccess";

export default function VersionHistory() {
  const { id } = useParams();
  const { notify, user } = useApp();
  const navigate = useNavigate();
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    try {
      const data = await api(`/api/documents/${id}`);
      setDoc(data.document);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const uploadVersion = async (file) => {
    setError("");
    const extension = file.name.split(".").pop().toLowerCase();
    if (!["pdf", "doc", "docx", "jpg", "jpeg", "png", "txt"].includes(extension)) {
      setError("Unsupported file type. Use PDF, DOC, DOCX, JPG, PNG or TXT.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError("File exceeds the 50 MB limit");
      return;
    }

    const form = new FormData();
    form.append("file", file);
    setUploading(true);
    try {
      await api(`/api/documents/${id}/versions`, { method: "POST", form });
      notify("New version stored. Previous versions remain preserved.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  if (error && !doc) return <div className="card empty" role="alert">{error}</div>;
  if (!doc) return <div className="empty">Loading versions…</div>;
  const versions = [...(doc.versions || [])].reverse();

  return (
    <div>
      <button className="btn btn-ghost" onClick={() => navigate(`/documents/${doc.id}`)}>
        <ArrowLeft size={16} /> Back to document
      </button>
      <div className="page-head" style={{ marginTop: 16 }}>
        <div>
          <h1>Version History</h1>
          <p>
            {doc.caseId} · {doc.name}
          </p>
        </div>
        {hasPermission(user, "docs.upload") &&
            doc.captureSource !== "audio" &&
            !["Completed", "Closed"].includes(doc.caseStatus) ? (
          <label className={`btn btn-primary ${uploading ? "disabled" : ""}`}>
            <Upload size={16} /> {uploading ? "Uploading…" : "Upload new version"}
            <input
              type="file"
              hidden
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt"
              disabled={uploading}
              onChange={(e) => {
                if (e.target.files?.[0]) uploadVersion(e.target.files[0]);
                e.target.value = "";
              }}
            />
          </label>
        ) : null}
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Version</th>
                <th>Uploaded By</th>
                <th>Timestamp</th>
                <th>Size</th>
                <th>SHA-256</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.version}>
                  <td>
                    <strong>{v.version}</strong>
                  </td>
                  <td>{v.uploadedByName}</td>
                  <td>{new Date(v.date).toLocaleString()}</td>
                  <td>{v.size}</td>
                  <td>
                    <code className="hash">{v.sha256}</code>
                  </td>
                  <td>
                    <button
                      className="icon-btn"
                      aria-label={`Preview ${v.version}`}
                      onClick={() => navigate(`/documents/${doc.id}`)}
                    >
                      <Eye size={16} />
                    </button>
                    {hasPermission(user, "docs.download") ? (
                      <button
                        className="icon-btn"
                        aria-label={`Download ${v.version}`}
                        onClick={() =>
                          downloadAuthorized(
                            `/api/documents/${doc.id}/file?v=${encodeURIComponent(v.version)}&download=1`,
                            v.originalName || doc.name
                          )
                            .then(() => notify("Secure download started"))
                            .catch((err) => setError(err.message))
                        }
                      >
                        <Download size={16} />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
