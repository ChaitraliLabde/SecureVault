import { Download, Eye, History, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import DataTable from "../components/DataTable";
import FilterBar from "../components/FilterBar";
import PageHeader from "../components/PageHeader";
import { useApp } from "../context/AppContext";
import { downloadAuthorized } from "../lib/download";
import { hasPermission } from "../lib/roleAccess";

export default function Documents() {
  const { meta, notify, user } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [rows, setRows] = useState([]);
  const [cases, setCases] = useState([]);
  const [q, setQ] = useState("");
  const [caseId, setCaseId] = useState("");
  const evidenceView = new URLSearchParams(location.search).get("view") === "evidence";
  const [type, setType] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (caseId) params.set("caseId", caseId);
    if (type) params.set("type", type);
    try {
      const data = await api(`/api/documents?${params}`);
      setRows(evidenceView
        ? data.documents.filter((doc) => ["Digital Evidence", "Forensic Report"].includes(doc.type))
        : data.documents);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
    api("/api/cases").then((d) => setCases(d.cases)).catch((err) => setError(err.message));
  }, [location.search]);

  return (
    <div>
      <PageHeader
        title={evidenceView ? "Evidence Review" : "Documents"}
        subtitle={evidenceView
          ? "Preview authorized digital and forensic evidence without changing the source records."
          : "Search FIRs, evidence, reports and court files linked to cases in your authorized scope."}
        actions={hasPermission(user, "docs.upload") ? (
          <button className="btn btn-primary" onClick={() => navigate("/documents/upload")}>
            <Upload size={16} /> Upload Document
          </button>
        ) : null}
      />
      <div className="card">
        {error ? <p className="form-error card-pad" role="alert">{error}</p> : null}
        <FilterBar search={q} onSearch={setQ} onSubmit={load} placeholder="Search filename, title or case ID">
          <select className="select" style={{ width: 180 }} value={caseId} onChange={(e) => setCaseId(e.target.value)}>
            <option value="">All Cases</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id}
              </option>
            ))}
          </select>
          <select className="select" style={{ width: 200 }} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All Types</option>
            {(meta.docTypes || []).map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </FilterBar>
        <DataTable
          rows={rows}
          emptyTitle="No documents yet"
          emptyText="Upload an authorized file to a case to start the trail."
          onRowClick={(d) => navigate(`/documents/${d.id}`)}
          columns={[
            { key: "name", label: "File Name", render: (d) => <span className="linkish">{d.name}</span> },
            { key: "type", label: "Type" },
            { key: "caseId", label: "Case" },
            { key: "uploadedByName", label: "Uploaded By" },
            { key: "uploadedOnLabel", label: "Uploaded On" },
            {
              key: "actions",
              label: "Actions",
              stopRowClick: true,
              render: (d) => (
                <>
                  <button className="icon-btn" title="Preview" onClick={() => navigate(`/documents/${d.id}`)}>
                    <Eye size={16} />
                  </button>
                  <button className="icon-btn" title="Versions" onClick={() => navigate(`/documents/${d.id}/versions`)}>
                    <History size={16} />
                  </button>
                  {hasPermission(user, "docs.download") ? (
                    <button
                      className="icon-btn"
                      title="Download"
                      aria-label={`Download ${d.name}`}
                      onClick={() =>
                        downloadAuthorized(`/api/documents/${d.id}/file?download=1`, d.name)
                          .then(() => notify("Secure download started"))
                          .catch((e) => notify(e.message))
                      }
                    >
                      <Download size={16} />
                    </button>
                  ) : null}
                </>
              ),
            },
          ]}
          footer={`Showing ${rows.length} document(s)`}
        />
      </div>
    </div>
  );
}
