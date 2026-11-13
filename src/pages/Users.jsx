import { useEffect, useState } from "react";
import { api } from "../api";
import Badge from "../components/Badge";
import { useApp } from "../context/AppContext";
import { ROLE_LABELS } from "../lib/roleAccess";

export default function Users() {
  const { meta, notify } = useApp();

  const [users, setUsers] = useState([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingRoleChange, setPendingRoleChange] = useState(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    username: "",
    role: "Investigating Officer",
    supervisorId: "",
    password: "",
  });

  // Get all active Supervisors
  const supervisors = users.filter(
    (u) => u.role === "Supervisor" && u.status === "Active"
  );

  // Load users
  const load = async () => {
    try {
      const data = await api("/api/users");
      setUsers(data.users);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Create user
  const create = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      await api("/api/users", {
        method: "POST",
        body: form,
      });

      notify("User created");

      setForm({
        name: "",
        email: "",
        username: "",
        role: "Investigating Officer",
        supervisorId: "",
        password: "",
      });

      setOpen(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Update user
  const patch = async (id, body) => {
    setError("");

    try {
      await api(`/api/users/${id}`, {
        method: "PATCH",
        body,
      });

      await load();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  };

  // Archive user
const archiveUser = async (user) => {
  const confirmed = window.confirm(
    `Are you sure you want to archive ${user.name}'s account?`
  );

  if (!confirmed) return;

  setError("");

  try {
    const data = await api(`/api/users/${user.id}`, {
      method: "DELETE",
    });

    notify(data.message || "User account archived successfully");

    await load();
  } catch (err) {
    setError(err.message);
  }
};

  // Save pending role and Supervisor assignment
  const saveRoleChange = async () => {
    if (!pendingRoleChange) return;

    const { userId, role, supervisorId } = pendingRoleChange;

    if (role === "Investigating Officer" && !supervisorId) {
      setError("Please select a Supervisor");
      return;
    }

    const success = await patch(userId, {
      role,
      ...(role === "Investigating Officer" && { supervisorId }),
    });

    if (success) {
      setPendingRoleChange(null);
      notify("User role and Supervisor updated");
    }
  };

  // Reset MFA
  const resetMfa = async (user) => {
    if (
      !window.confirm(
        `Reset multi-factor authentication for ${user.name}? They will need to enroll again.`
      )
    ) {
      return;
    }

    setError("");

    try {
      await api(`/api/users/${user.id}/mfa-reset`, {
        method: "POST",
        body: {},
      });

      notify(`MFA reset for ${user.name}`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  // Search users
  const filtered = users.filter((u) =>
    `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>User Management</h1>
          <p>
            Manage accounts and roles. Case and document visibility stays
            limited to each user’s assigned cases.
          </p>
        </div>

        <button
          className="btn btn-primary"
          onClick={() => {
            setError("");
            setOpen(true);
          }}
        >
          Add user
        </button>
      </div>

      <div className="card">
        {error && !open ? (
          <p className="form-error card-pad" role="alert">
            {error}
          </p>
        ) : null}

        <div className="card-pad">
          <input
            className="input"
            placeholder="Search users"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Supervisor</th>
                <th>Status</th>
                <th>MFA</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <div className="avatar">{u.initials}</div>
                      <strong>{u.name}</strong>
                    </div>
                  </td>

                  <td>{u.email}</td>

                  {/* Role */}
                  <td>
                    <select
                      className="select"
                      value={
                        pendingRoleChange?.userId === u.id
                          ? pendingRoleChange.role
                          : u.role
                      }
                      onChange={(e) => {
                        const nextRole = e.target.value;

                        if (
                          nextRole === "Investigating Officer" &&
                          u.role !== "Investigating Officer"
                        ) {
                          setError("");
                          setPendingRoleChange({
                            userId: u.id,
                            role: nextRole,
                            supervisorId: "",
                          });
                        } else {
                          setPendingRoleChange(null);
                          patch(u.id, { role: nextRole });
                        }
                      }}
                    >
                      {(meta.roles || []).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r] || r}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* Supervisor assignment */}
                  <td>
                    {pendingRoleChange?.userId === u.id ? (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                        }}
                      >
                        <select
                          className="select"
                          value={pendingRoleChange.supervisorId}
                          onChange={(e) =>
                            setPendingRoleChange({
                              ...pendingRoleChange,
                              supervisorId: e.target.value,
                            })
                          }
                        >
                          <option value="">Select Supervisor</option>

                          {supervisors.map((supervisor) => (
                            <option
                              key={supervisor.id}
                              value={supervisor.id}
                            >
                              {supervisor.name}
                            </option>
                          ))}
                        </select>

                        <div className="actions-row">
                          <button
                            className="btn btn-primary"
                            type="button"
                            onClick={saveRoleChange}
                          >
                            Save
                          </button>

                          <button
                            className="btn btn-ghost"
                            type="button"
                            onClick={() => {
                              setPendingRoleChange(null);
                              setError("");
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : u.role === "Investigating Officer" ? (
                      supervisors.length > 0 ? (
                        <select
                          className="select"
                          value={u.supervisorId || ""}
                          onChange={(e) =>
                            patch(u.id, {
                              supervisorId: e.target.value,
                            })
                          }
                        >
                          <option value="">Select Supervisor</option>

                          {supervisors.map((supervisor) => (
                            <option
                              key={supervisor.id}
                              value={supervisor.id}
                            >
                              {supervisor.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span>No active supervisors</span>
                      )
                    ) : (
                      <span>—</span>
                    )}
                  </td>

                  {/* Account status */}
                  <td>
                    <button
                      className="icon-btn"
                      onClick={() =>
                        patch(u.id, {
                          status:
                            u.status === "Active" ? "Inactive" : "Active",
                        })
                      }
                    >
                      <Badge status={u.status} />
                    </button>
                  </td>

                  {/* MFA */}
                  <td>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <Badge
                        status={u.mfaEnabled ? "Enabled" : "Disabled"}
                      />

                      {u.mfaEnabled ? (
                        <button
                          className="btn btn-ghost"
                          type="button"
                          onClick={() => resetMfa(u)}
                        >
                          Reset MFA
                        </button>
                      ) : null}
                    </div>
                  </td>
                  {/* Actions */}
                  <td>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={() => archiveUser(u)}
                      style={{ color: "#dc2626" }}
                    >
                      Archive
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal */}
      {open ? (
        <div
          className="modal-backdrop"
          onClick={() => {
            setError("");
            setOpen(false);
          }}
        >
          <form
            className="modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={create}
          >
            <h2 style={{ marginBottom: 14 }}>Add user</h2>

            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}

            <div className="form-grid">
              <input
                className="input"
                placeholder="Full name"
                required
                value={form.name}
                onChange={(e) =>
                  setForm({ ...form, name: e.target.value })
                }
              />

              <input
                className="input"
                placeholder="Email"
                type="email"
                required
                value={form.email}
                onChange={(e) =>
                  setForm({ ...form, email: e.target.value })
                }
              />

              <input
                className="input"
                placeholder="Username"
                required
                value={form.username}
                onChange={(e) =>
                  setForm({ ...form, username: e.target.value })
                }
              />

              <input
                className="input"
                placeholder="Initial password (at least 8 characters)"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={form.password}
                onChange={(e) =>
                  setForm({ ...form, password: e.target.value })
                }
              />

              {/* Role selection */}
              <select
                className="select"
                value={form.role}
                onChange={(e) =>
                  setForm({
                    ...form,
                    role: e.target.value,
                    supervisorId:
                      e.target.value === "Investigating Officer"
                        ? form.supervisorId
                        : "",
                  })
                }
              >
                {(meta.roles || []).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r] || r}
                  </option>
                ))}
              </select>

              {/* Supervisor selection for Investigating Officers */}
              {form.role === "Investigating Officer" && (
                <select
                  className="select"
                  required
                  value={form.supervisorId}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      supervisorId: e.target.value,
                    })
                  }
                >
                  <option value="">Select Supervisor</option>

                  {supervisors.map((supervisor) => (
                    <option key={supervisor.id} value={supervisor.id}>
                      {supervisor.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="actions-row">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setError("");
                  setOpen(false);
                }}
              >
                Cancel
              </button>

              <button
                className="btn btn-primary"
                type="submit"
                disabled={saving}
              >
                {saving ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}