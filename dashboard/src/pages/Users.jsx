import { useEffect, useState } from "react";

const KEY = "envmon.users.v1";

const seed = [
  { id: 1, name: "Deepak",  email: "deepakarclab@outlook.com", role: "Admin",  active: true  },
  { id: 2, name: "Operator", email: "ops@example.com",          role: "Viewer", active: true  },
];

const ROLES = ["Admin", "Operator", "Viewer"];

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || seed; }
  catch { return seed; }
}
function save(list) { localStorage.setItem(KEY, JSON.stringify(list)); }

export default function Users() {
  const [users, setUsers] = useState(load());
  const [form,  setForm]  = useState({ name: "", email: "", role: "Viewer" });

  function patch(id, partial) {
    setUsers(u => {
      const next = u.map(x => x.id === id ? { ...x, ...partial } : x);
      save(next); return next;
    });
  }
  function remove(id) {
    setUsers(u => { const next = u.filter(x => x.id !== id); save(next); return next; });
  }
  function add() {
    if (!form.name || !form.email) return;
    const next = [...users, { ...form, id: Date.now(), active: true }];
    setUsers(next); save(next);
    setForm({ name: "", email: "", role: "Viewer" });
  }

  return (
    <section className="page page-users">
      <header className="page-header">
        <div>
          <h1>Users</h1>
          <p className="page-sub">Manage dashboard accounts. Stored locally — wire to Cognito later.</p>
        </div>
      </header>

      <div className="card table-card">
        <table className="device-table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th><th></th></tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td className="mono">{u.email}</td>
                <td>
                  <select value={u.role}
                          onChange={e => patch(u.id, { role: e.target.value })}>
                    {ROLES.map(r => <option key={r}>{r}</option>)}
                  </select>
                </td>
                <td>
                  <button className={`toggle ${u.active ? "toggle-on" : ""}`}
                          onClick={() => patch(u.id, { active: !u.active })}>
                    <span />
                  </button>
                </td>
                <td>
                  <button className="row-cta" onClick={() => remove(u.id)}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card form-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Add user</h3>
        <div className="add-user">
          <input className="search" placeholder="Name"
                 value={form.name}
                 onChange={e => setForm({ ...form, name: e.target.value })} />
          <input className="search" placeholder="Email"
                 value={form.email}
                 onChange={e => setForm({ ...form, email: e.target.value })} />
          <select className="search"
                  value={form.role}
                  onChange={e => setForm({ ...form, role: e.target.value })}>
            {ROLES.map(r => <option key={r}>{r}</option>)}
          </select>
          <button className="primary-btn" onClick={add}>Add</button>
        </div>
      </div>
    </section>
  );
}
