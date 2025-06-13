import { FloatingLabelInput, RippleButton, CollapsibleCard, Select } from "@app/components/index";
import { useState } from "react";
import { useDNSStore } from "@app/stores/dnsStore";
import { useDNSTestStore } from "@app/stores/dnsTestStore";

export default function DNSTestTool() {
  const { config: dnsConfig } = useDNSStore();
  const { results, isRunning, testUDP, testDoH, runAllTests, clearResults } =
    useDNSTestStore();

  const [testDomain, setTestDomain] = useState("google.com");
  const [testMethod, setTestMethod] = useState<
    "UDP" | "DoH-GET" | "DoH-POST" | "ALL"
  >("ALL");

  const runTests = async () => {
    if (!testDomain.trim()) return;

    if (testMethod === "ALL") {
      await runAllTests(testDomain);
    } else if (testMethod === "UDP") {
      await testUDP(testDomain, dnsConfig.port || 53);
    } else if (testMethod === "DoH-GET") {
      await testDoH(testDomain, "GET");
    } else if (testMethod === "DoH-POST") {
      await testDoH(testDomain, "POST");
    }
  };

  const formatDuration = (duration?: number) => {
    if (!duration) return "-";
    return `${duration}ms`;
  };

  const formatTimestamp = (timestamp: Date) => {
    return timestamp.toLocaleTimeString();
  };

  return (
    <CollapsibleCard title="DNS Test Tool">
      <div className="space-y-6">
        {/* Test Configuration */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <FloatingLabelInput
              label="Domain to Test"
              value={testDomain}
              onChange={(e) => setTestDomain(e.target.value)}
            />
          </div>

          <div className="flex-1 min-w-[200px]">
            <Select
              label="Test Method"
              labelPosition="left"
              value={testMethod}
              onChange={(value) =>
                setTestMethod(value as "ALL" | "UDP" | "DoH-GET" | "DoH-POST")
              }
              options={[
                { value: "ALL", label: "All Methods" },
                { value: "UDP", label: "UDP Query" },
                { value: "DoH-GET", label: "DoH GET" },
                { value: "DoH-POST", label: "DoH POST" },
              ]}
            />
          </div>

          <div className="flex gap-2">
            <RippleButton
              variant="solid"
              color="green"
              onClick={runTests}
              loading={isRunning}
              disabled={!testDomain.trim()}
            >
              <span className="material-icons">play_arrow</span>
              <span>Run Test</span>
            </RippleButton>
            <RippleButton variant="soft" color="red" onClick={clearResults}>
              <span className="material-icons">clear_all</span>
              <span>Clear</span>
            </RippleButton>
          </div>
        </div>

        {/* Quick Test Buttons */}
        <div className="flex gap-2 flex-wrap">
          {[
            { domain: "google.com", icon: "g_translate" },
            { domain: "example.com", icon: "language" },
            { domain: "github.com", icon: "code" },
            { domain: "cloudflare.com", icon: "cloud" }
          ].map(
            ({ domain, icon }) => (
              <RippleButton
                key={domain}
                variant="soft"
                onClick={() => setTestDomain(domain)}
                className="text-xs"
              >
                <span className="material-icons text-sm">{icon}</span>
                <span>{domain}</span>
              </RippleButton>
            )
          )}
        </div>

        {/* Results Table */}
        {results.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium">Test Results</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Time</th>
                    <th className="text-left p-2">Domain</th>
                    <th className="text-left p-2">Method</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Duration</th>
                    <th className="text-left p-2">IPs</th>
                    <th className="text-left p-2">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result) => (
                    <tr key={result.id} className="border-b hover:bg-gray-50">
                      <td className="p-2 text-xs text-gray-500">
                        {formatTimestamp(result.timestamp)}
                      </td>
                      <td className="p-2 font-mono text-xs">{result.domain}</td>
                      <td className="p-2">
                        <span
                          className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                            result.method === "UDP"
                              ? "bg-blue-100 text-blue-800"
                              : result.method === "DoH-GET"
                              ? "bg-green-100 text-green-800"
                              : "bg-purple-100 text-purple-800"
                          }`}
                        >
                          {result.method}
                        </span>
                      </td>
                      <td className="p-2">
                        <span
                          className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                            result.status === "success"
                              ? "bg-green-100 text-green-800"
                              : result.status === "error"
                              ? "bg-red-100 text-red-800"
                              : "bg-yellow-100 text-yellow-800"
                          }`}
                        >
                          {result.status === "pending" ? "..." : result.status}
                        </span>
                      </td>
                      <td className="p-2 font-mono text-xs">
                        {formatDuration(result.duration)}
                      </td>
                      <td className="p-2 font-mono text-xs">
                        {result.ips
                          ? result.ips.join(", ")
                          : result.error
                          ? "-"
                          : "..."}
                      </td>
                      <td className="p-2 text-xs text-gray-600">
                        {result.error ||
                          result.details ||
                          (result.status === "pending" ? "..." : "")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </CollapsibleCard>
  );
}
