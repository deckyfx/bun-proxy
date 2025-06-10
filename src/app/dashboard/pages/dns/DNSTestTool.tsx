import { Button, Card, FloatingLabelInput, Select } from "@app/components/index";
import { useState } from "react";
import { useDNSStore } from "@app/stores/dnsStore";
import { useDNSTestStore } from "@app/stores/dnsTestStore";

export default function DNSTestTool() {
  const { config: dnsConfig } = useDNSStore();
  const {
    results,
    isRunning,
    testUDP,
    testDoH,
    runAllTests,
    clearResults
  } = useDNSTestStore();
  
  const [testDomain, setTestDomain] = useState("google.com");
  const [testMethod, setTestMethod] = useState<'UDP' | 'DoH-GET' | 'DoH-POST' | 'ALL'>('ALL');

  const runTests = async () => {
    if (!testDomain.trim()) return;
    
    if (testMethod === 'ALL') {
      await runAllTests(testDomain);
    } else if (testMethod === 'UDP') {
      await testUDP(testDomain, dnsConfig.port || 53);
    } else if (testMethod === 'DoH-GET') {
      await testDoH(testDomain, 'GET');
    } else if (testMethod === 'DoH-POST') {
      await testDoH(testDomain, 'POST');
    }
  };

  const formatDuration = (duration?: number) => {
    if (!duration) return '-';
    return `${duration}ms`;
  };

  const formatTimestamp = (timestamp: Date) => {
    return timestamp.toLocaleTimeString();
  };

  return (
    <Card title="DNS Test Tool">
      <div className="space-y-6">
        {/* Test Configuration */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FloatingLabelInput
            label="Domain to Test"
            value={testDomain}
            onChange={(e) => setTestDomain(e.target.value)}
            placeholder="example.com"
          />
          
          <Select
            label="Test Method"
            value={testMethod}
            onChange={(value) => setTestMethod(value as any)}
            options={[
              { value: 'ALL', label: 'All Methods' },
              { value: 'UDP', label: 'UDP Query' },
              { value: 'DoH-GET', label: 'DoH GET' },
              { value: 'DoH-POST', label: 'DoH POST' }
            ]}
          />
          
          <div className="flex gap-2">
            <Button
              variant="primary"
              onClick={runTests}
              isLoading={isRunning}
              disabled={!testDomain.trim()}
              icon="play_arrow"
              className="flex-1"
            >
              Run Test
            </Button>
            <Button
              variant="secondary"
              onClick={clearResults}
              icon="clear"
            >
              Clear
            </Button>
          </div>
        </div>

        {/* Quick Test Buttons */}
        <div className="flex gap-2 flex-wrap">
          {['google.com', 'example.com', 'github.com', 'cloudflare.com'].map(domain => (
            <Button
              key={domain}
              variant="secondary"
              size="sm"
              onClick={() => setTestDomain(domain)}
              className="text-xs"
            >
              {domain}
            </Button>
          ))}
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
                  {results.map(result => (
                    <tr key={result.id} className="border-b hover:bg-gray-50">
                      <td className="p-2 text-xs text-gray-500">
                        {formatTimestamp(result.timestamp)}
                      </td>
                      <td className="p-2 font-mono text-xs">{result.domain}</td>
                      <td className="p-2">
                        <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                          result.method === 'UDP' 
                            ? 'bg-blue-100 text-blue-800'
                            : result.method === 'DoH-GET'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-purple-100 text-purple-800'
                        }`}>
                          {result.method}
                        </span>
                      </td>
                      <td className="p-2">
                        <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                          result.status === 'success' 
                            ? 'bg-green-100 text-green-800'
                            : result.status === 'error'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {result.status === 'pending' ? '...' : result.status}
                        </span>
                      </td>
                      <td className="p-2 font-mono text-xs">
                        {formatDuration(result.duration)}
                      </td>
                      <td className="p-2 font-mono text-xs">
                        {result.ips ? result.ips.join(', ') : result.error ? '-' : '...'}
                      </td>
                      <td className="p-2 text-xs text-gray-600">
                        {result.error || result.details || (result.status === 'pending' ? '...' : '')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}