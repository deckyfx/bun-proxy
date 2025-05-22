import React, { useEffect, useState } from "react";

type ProxyRoute = {
  target: string;
  requestScript?: string;
  responseScript?: string;
};

export default function Dashboard() {
  const [routes, setRoutes] = useState<Record<string, ProxyRoute>>({});
  const [scripts, setScripts] = useState<string[]>([]);
  const [editingRoute, setEditingRoute] = useState<string | null>(null);

  // Form fields
  const [prefix, setPrefix] = useState("");
  const [target, setTarget] = useState("");
  const [requestScript, setRequestScript] = useState("");
  const [responseScript, setResponseScript] = useState("");

  // Script test
  const [testType, setTestType] = useState<"request" | "response">("request");
  const [testInput, setTestInput] = useState("");
  const [testResult, setTestResult] = useState("");
  const [testing, setTesting] = useState(false);

  // Load routes and scripts from backend
  useEffect(() => {
    fetch("/_/routes")
      .then((r) => r.json())
      .then(setRoutes);

    fetch("/_/scripts")
      .then((r) => r.json())
      .then(setScripts);
  }, []);

  function clearForm() {
    setPrefix("");
    setTarget("");
    setRequestScript("");
    setResponseScript("");
    setEditingRoute(null);
    setTestInput("");
    setTestResult("");
  }

  function onEditRoute(routePrefix: string) {
    const route = routes[routePrefix];
    setEditingRoute(routePrefix);
    setPrefix(routePrefix);
    setTarget(route?.target || "");
    setRequestScript(route?.requestScript || "");
    setResponseScript(route?.responseScript || "");
    setTestInput("");
    setTestResult("");
  }

  async function onSave() {
    if (!prefix || !target) {
      alert("Prefix and Target are required");
      return;
    }
    // Save to backend
    const newRoutes = {
      ...routes,
      [prefix]: { target, requestScript, responseScript },
    };
    const res = await fetch("/_/routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newRoutes),
    });
    if (res.ok) {
      setRoutes(newRoutes);
      clearForm();
    } else {
      alert("Failed to save routes");
    }
  }

  async function onDelete(routePrefix: string) {
    if (!window.confirm(`Delete route "${routePrefix}"?`)) return;
    const newRoutes = { ...routes };
    delete newRoutes[routePrefix];
    const res = await fetch("/_/routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newRoutes),
    });
    if (res.ok) {
      setRoutes(newRoutes);
      if (editingRoute === routePrefix) clearForm();
    } else {
      alert("Failed to delete route");
    }
  }

  async function testScript() {
    if (!testInput) {
      alert("Enter JSON input to test");
      return;
    }
    if (!requestScript && !responseScript) {
      alert("Select a script to test");
      return;
    }

    setTesting(true);
    setTestResult("");
    try {
      const scriptToTest =
        testType === "request" ? requestScript : responseScript;
      if (!scriptToTest) {
        alert(`No ${testType} script selected`);
        setTesting(false);
        return;
      }
      const res = await fetch(`/_/script/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script: scriptToTest,
          inputType: testType,
          inputData: JSON.parse(testInput),
        }),
      });
      const data = await res.json();
      if (data.error) {
        setTestResult("Error: " + data.error);
      } else {
        setTestResult(JSON.stringify(data.result, null, 2));
      }
    } catch (e) {
      setTestResult("Exception: " + (e as Error).message);
    }
    setTesting(false);
  }

  return (
    <div
      style={{
        padding: 20,
        maxWidth: 900,
        margin: "auto",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1>BunJS Proxy Dashboard</h1>
      <p style={{ fontStyle: "italic", fontSize: 14, color: "#555" }}>
        Routes use <b>prefix-based matching</b>. For example, if you set prefix{" "}
        <code>/api</code> to target <code>http://192.168.0.102:5000</code>, then
        requests to <code>/api/call</code> will be proxied to{" "}
        <code>http://192.168.0.102:5000/call</code>. More specific prefixes
        override less specific ones.
      </p>

      <h2>Routes</h2>
      <table
        style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}
      >
        <thead>
          <tr style={{ borderBottom: "1px solid #ccc" }}>
            <th style={{ textAlign: "left", padding: 8 }}>Prefix</th>
            <th style={{ textAlign: "left", padding: 8 }}>Target URL</th>
            <th style={{ textAlign: "left", padding: 8 }}>Request Script</th>
            <th style={{ textAlign: "left", padding: 8 }}>Response Script</th>
            <th style={{ textAlign: "center", padding: 8 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(routes).map(([key, route]) => (
            <tr key={key} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: 8 }}>{key}</td>
              <td style={{ padding: 8, wordBreak: "break-word" }}>
                {route.target}
              </td>
              <td style={{ padding: 8 }}>{route.requestScript || "-"}</td>
              <td style={{ padding: 8 }}>{route.responseScript || "-"}</td>
              <td style={{ padding: 8, textAlign: "center" }}>
                <button
                  onClick={() => onEditRoute(key)}
                  style={{ marginRight: 8 }}
                >
                  Edit
                </button>
                <button onClick={() => onDelete(key)} style={{ color: "red" }}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {Object.keys(routes).length === 0 && (
            <tr>
              <td
                colSpan={5}
                style={{ textAlign: "center", padding: 20, color: "#888" }}
              >
                No routes defined.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h2>{editingRoute ? `Edit Route "${editingRoute}"` : "Add New Route"}</h2>

      <div style={{ marginBottom: 12 }}>
        <label>
          Route Prefix (path): <br />
          <input
            type="text"
            placeholder="/api"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            style={{ width: "100%", padding: 8, fontSize: 14 }}
            disabled={!!editingRoute} // disable editing prefix key to keep stable keys
          />
        </label>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>
          Target URL: <br />
          <input
            type="text"
            placeholder="http://192.168.0.102:5000"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            style={{ width: "100%", padding: 8, fontSize: 14 }}
          />
        </label>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>
          Request Script: <br />
          <select
            value={requestScript}
            onChange={(e) => setRequestScript(e.target.value)}
            style={{ width: "100%", padding: 8, fontSize: 14 }}
          >
            <option value="">-- None --</option>
            {scripts.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>
          Response Script: <br />
          <select
            value={responseScript}
            onChange={(e) => setResponseScript(e.target.value)}
            style={{ width: "100%", padding: 8, fontSize: 14 }}
          >
            <option value="">-- None --</option>
            {scripts.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ marginTop: 20 }}>
        <button
          onClick={onSave}
          style={{ marginRight: 12, padding: "8px 16px", fontSize: 14 }}
        >
          Save
        </button>
        {editingRoute && (
          <button
            onClick={clearForm}
            style={{ padding: "8px 16px", fontSize: 14 }}
          >
            Cancel
          </button>
        )}
      </div>

      <hr style={{ margin: "40px 0" }} />

      <h2>Test Script</h2>
      <p style={{ fontSize: 14, fontStyle: "italic", color: "#555" }}>
        Test your request or response script here by providing JSON input and
        running the script.
      </p>

      <div style={{ marginBottom: 12 }}>
        <label>
          Script Type:{" "}
          <select
            value={testType}
            onChange={(e) =>
              setTestType(e.target.value as "request" | "response")
            }
            style={{ marginLeft: 8, padding: 4, fontSize: 14 }}
          >
            <option value="request">Request</option>
            <option value="response">Response</option>
          </select>
        </label>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>
          Script to Test:{" "}
          <select
            value={testType === "request" ? requestScript : responseScript}
            onChange={(e) =>
              testType === "request"
                ? setRequestScript(e.target.value)
                : setResponseScript(e.target.value)
            }
            style={{ width: "100%", padding: 8, fontSize: 14 }}
          >
            <option value="">-- None --</option>
            {scripts.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>
          JSON Input: <br />
          <textarea
            rows={8}
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            placeholder='e.g. {"url":"/api/test","method":"GET","headers":{},"body":""}'
            style={{ width: "100%", fontFamily: "monospace", fontSize: 14 }}
          />
        </label>
      </div>

      <button
        onClick={testScript}
        disabled={testing}
        style={{ padding: "8px 16px", fontSize: 14 }}
      >
        {testing ? "Testing..." : "Run Test"}
      </button>

      {testResult && (
        <pre
          style={{
            marginTop: 12,
            background: "#eee",
            padding: 10,
            whiteSpace: "pre-wrap",
            maxHeight: 300,
            overflowY: "auto",
            fontSize: 14,
          }}
        >
          {testResult}
        </pre>
      )}
    </div>
  );
}
