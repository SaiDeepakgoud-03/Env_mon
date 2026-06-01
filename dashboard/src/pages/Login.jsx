import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../auth.js";

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(username, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-screen">
      <form className="login-panel" onSubmit={submit}>
        <span className="eyebrow">Distributed environment monitoring</span>
        <h1>Environment Monitor</h1>
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button className="primary-button" disabled={busy}>{busy ? "Signing in..." : "Login"}</button>
        {error && <p className="form-error">{error}</p>}
        <p className="muted">Uses Cognito when pool env vars are configured. Local dev accepts any non-empty login.</p>
      </form>
    </main>
  );
}
