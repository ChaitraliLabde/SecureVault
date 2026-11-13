import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import FileUploader from "../components/FileUploader";
import { CameraEvidenceCapture } from "../components/MediaEvidenceTools";
import PageHeader from "../components/PageHeader";
import { useApp } from "../context/AppContext";

export default function UploadDocument() {
  const { meta, notify } = useApp();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [cases, setCases] = useState([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [loadingCases, setLoadingCases] = useState(true);
  const [form, setForm] = useState({
    caseId: params.get("caseId") || "",
    type: "Investigation Report",
    title: "",
    description: "",
    file: null,
  });
  const availableCases = cases.filter(
    (c) => !["Completed", "Closed"].includes(c.status)
  );

  useEffect(() => {
  api("/api/cases")
    .then((d) => {
      setCases(d.cases);

      const selectableCases = d.cases.filter(
        (c) => !["Completed", "Closed"].includes(c.status)
      );

      setForm((f) => ({
        ...f,
        caseId: selectableCases.some((c) => c.id === f.caseId)
          ? f.caseId
          : selectableCases[0]?.id || "",
      }));
    })
    .catch((err) => setError(err.message))
    .finally(() => setLoadingCases(false));
}, []);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const selectedCase = cases.find((c) => c.id === form.caseId);

if (!selectedCase) {
  setError("Please select an available case.");
  return;
}

if (["Completed", "Closed"].includes(selectedCase.status)) {
  setError("Cannot upload documents to a completed or closed case.");
  return;
}
    if (!form.file) {
      setError("Choose a file to upload");
      return;
    }
    const ext = form.file.name.split(".").pop().toLowerCase();
    if (!["pdf", "doc", "docx", "jpg", "jpeg", "png"].includes(ext)) {
      setError("Unsupported file type. Use PDF, DOC, DOCX, JPG or PNG.");
      return;
    }
    if (form.file.size > 50 * 1024 * 1024) {
      setError("File exceeds the 50 MB limit");
      return;
    }
    const payload = new FormData();
    payload.append("file", form.file);
    payload.append("caseId", form.caseId);
    payload.append("type", form.type);
    payload.append("title", form.title);
    payload.append("description", form.description);
    try {
      setProgress(35);
      await api("/api/documents", { method: "POST", form: payload });
      setProgress(100);
      notify("Document stored privately. SHA-256 recorded.");
      navigate("/documents");
    } catch (err) {
      setProgress(0);
      setError(err.message);
    }
  };

  return (
    <div>
      <PageHeader
        title="Upload Document"
        subtitle="The API validates access, stores the file privately, calculates SHA-256, saves metadata and records the upload in the audit trail."
      />
      <form className="card card-pad" onSubmit={submit} style={{ maxWidth: 760 }}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="upload-case">Select Case</label>
            <select
              id="upload-case"
              className="select"
              value={form.caseId}
              onChange={(e) => setForm({ ...form, caseId: e.target.value })}
              disabled={loadingCases || !cases.length}
            >
              {availableCases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id} - {c.title}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Document Type</label>
            <select className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {(meta.docTypes || []).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Title</label>
            <input
              className="input"
              required
              placeholder="Investigation Report - Phase 1"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Description</label>
            <textarea
              className="textarea"
              rows={4}
              placeholder="Initial investigation report with findings and evidence details."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="media-capture-upload">
            <div className="card-title">Capture evidence directly</div>
            <p className="muted">Camera captures are stored against the selected case with a server-generated SHA-256 baseline and custody event.</p>
            <CameraEvidenceCapture caseId={form.caseId} disabled={loadingCases || !availableCases.length} />
          </div>
          <FileUploader
            file={form.file}
            progress={progress}
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
            onFile={(file) => setForm({ ...form, file })}
          />
        </div>
        {!loadingCases && !availableCases.length && !error ? (
  <p className="muted">
    No active cases are available for document uploads.
    Completed and closed cases cannot receive new documents.
  </p>
) : null}
        {error ? <p className="form-error">{error}</p> : null}
        <div className="actions-row">
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" disabled={loadingCases || progress === 35 || !availableCases.length}>
            {progress === 35 ? "Uploading…" : "Upload Document"}
          </button>
        </div>
      </form>
    </div>
  );
}
