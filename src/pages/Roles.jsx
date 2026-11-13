import { useEffect, useState } from "react";
import { api } from "../api";
import { ROLE_LABELS } from "../lib/roleAccess";

export default function Roles() {
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [matrix, setMatrix] = useState({});
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/roles").then((d) => {
      setRoles(d.roles);
      setPermissions(d.permissions);
      setMatrix(d.matrix);
    }).catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Roles & Permissions</h1>
          <p>
            Permissions are enforced by the API and reflected in each role’s navigation.
          </p>
        </div>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        Reviewer permissions are read-only. Case visibility remains scoped to assigned cases, except Supervisors, who can monitor cases assigned to active Investigating Officers.
      </div>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Feature</th>
              {roles.map((role) => <th key={role}>{ROLE_LABELS[role] || role}</th>)}
            </tr>
          </thead>
          <tbody>
            {permissions.map((p) => (
              <tr key={p.key}>
                <td>{p.label}</td>
                {roles.map((role) => (
                  <td key={role} aria-label={`${ROLE_LABELS[role] || role}: ${(matrix[role] || []).includes(p.key) ? "allowed" : "not allowed"}`}>
                    {(matrix[role] || []).includes(p.key) ? "Allowed" : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ marginTop: 12 }}>
        Account roles: {roles.map((role) => ROLE_LABELS[role] || role).join(", ")}.
      </p>
    </div>
  );
}
