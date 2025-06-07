import { Button, FloatingLabelInput } from "@app_components/index";
import { useState, useEffect } from "react";
import { PageContainer } from "../components/PageContainer";
import type { DNSStatus, DNSToggleResponse } from "@typed/dns";

export default function DNS() {
  const [dnsStatus, setDnsStatus] = useState<DNSStatus>({
    enabled: false,
    server: null,
    config: {
      port: 53,
      providers: [],
      canUseLowPorts: false,
      platform: 'unknown',
      isPrivilegedPort: true
    }
  });
  const [dnsLoading, setDnsLoading] = useState(false);
  const [customPort, setCustomPort] = useState<string>('');
  const [portError, setPortError] = useState<string>('');

  const fetchDnsStatus = async () => {
    try {
      const response = await fetch('/api/dns/status');
      const data: DNSStatus = await response.json();
      setDnsStatus(data);
      // Initialize custom port with current configured port
      if (!customPort) {
        setCustomPort(String(data.config.port));
      }
    } catch (error) {
      console.error('Failed to fetch DNS status:', error);
    }
  };

  const validatePort = (port: string): string => {
    const portNum = parseInt(port);
    
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      return 'Port must be between 1 and 65535';
    }
    
    if (portNum < 1000 && !dnsStatus.config.canUseLowPorts) {
      const privilegeMsg = dnsStatus.config.platform === 'win32' 
        ? 'Run as Administrator to use privileged ports (< 1000)'
        : 'Run with sudo to use privileged ports (< 1000)';
      return privilegeMsg;
    }
    
    return '';
  };

  const handlePortChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setCustomPort(value);
    const error = validatePort(value);
    setPortError(error);
  };

  const toggleDnsServer = async () => {
    // Validate port before starting
    if (!dnsStatus.enabled) {
      const error = validatePort(customPort);
      if (error) {
        setPortError(error);
        return;
      }
    }

    setDnsLoading(true);
    try {
      const endpoint = dnsStatus.enabled ? '/api/dns/stop' : '/api/dns/start';
      const body = !dnsStatus.enabled && customPort ? 
        JSON.stringify({ port: parseInt(customPort) }) : 
        undefined;
      
      const response = await fetch(endpoint, { 
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body
      });
      
      const data: DNSToggleResponse = await response.json();
      setDnsStatus(data.status);
    } catch (error) {
      console.error('Failed to toggle DNS server:', error);
      alert('Failed to toggle DNS server');
    } finally {
      setDnsLoading(false);
    }
  };

  useEffect(() => {
    fetchDnsStatus();
    // Auto-refresh status every 10 seconds
    const interval = setInterval(fetchDnsStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <PageContainer title="DNS Proxy Server">
      <div className="space-y-6">
        
        {/* Server Status Card */}
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Server Status</h2>
              <p className="text-sm text-gray-500 mt-1">
                {dnsStatus.enabled ? 'DNS proxy is running and intercepting queries' : 'DNS proxy is currently stopped'}
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                dnsStatus.enabled 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-red-100 text-red-800'
              }`}>
                {dnsStatus.enabled ? 'Running' : 'Stopped'}
              </span>
              <Button 
                variant={dnsStatus.enabled ? "secondary" : "primary"}
                size="md"
                onClick={toggleDnsServer}
                isLoading={dnsLoading}
                icon={dnsStatus.enabled ? "stop" : "play_arrow"}
              >
                {dnsStatus.enabled ? 'Stop Server' : 'Start Server'}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-sm font-medium text-gray-500">Port</div>
              <div className="text-lg font-mono text-gray-900">
                {dnsStatus.server?.port || dnsStatus.config?.port || 'N/A'}
              </div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-sm font-medium text-gray-500">Providers</div>
              <div className="text-sm text-gray-900">
                {dnsStatus.server?.providers?.join(', ') || dnsStatus.config?.providers?.join(', ') || 'N/A'}
              </div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-sm font-medium text-gray-500">Status</div>
              <div className="text-sm text-gray-900">{dnsStatus.enabled ? 'Active' : 'Inactive'}</div>
            </div>
          </div>
        </div>

        {/* Port Configuration Card - Only shown when server is stopped */}
        {!dnsStatus.enabled && (
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Port Configuration</h2>
            <div className="space-y-4">
              <div className="max-w-xs">
                <FloatingLabelInput
                  id="dns-port"
                  label="DNS Server Port"
                  type="number"
                  value={customPort}
                  onChange={handlePortChange}
                  error={portError}
                  min="1"
                  max="65535"
                />
              </div>
              
              {/* Port privilege warning */}
              {customPort && parseInt(customPort) < 1000 && (
                <div className={`border rounded-lg p-4 ${
                  dnsStatus.config.canUseLowPorts 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-yellow-50 border-yellow-200'
                }`}>
                  <div className="flex">
                    <div className={`mr-3 ${
                      dnsStatus.config.canUseLowPorts ? 'text-green-600' : 'text-yellow-600'
                    }`}>
                      {dnsStatus.config.canUseLowPorts ? '✅' : '⚠️'}
                    </div>
                    <div>
                      <h3 className={`text-sm font-medium ${
                        dnsStatus.config.canUseLowPorts ? 'text-green-800' : 'text-yellow-800'
                      }`}>
                        Privileged Port {parseInt(customPort)}
                      </h3>
                      <p className={`text-sm mt-1 ${
                        dnsStatus.config.canUseLowPorts ? 'text-green-700' : 'text-yellow-700'
                      }`}>
                        {dnsStatus.config.canUseLowPorts 
                          ? `Running with administrator privileges. Port ${customPort} is available.`
                          : `Ports below 1000 require administrator privileges. ${
                              dnsStatus.config.platform === 'win32' 
                                ? 'Run as Administrator' 
                                : 'Run with sudo'
                            } to use port ${customPort}.`
                        }
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Standard ports suggestion */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="text-sm font-medium text-gray-800 mb-2">Common DNS Ports</h4>
                <div className="flex flex-wrap gap-2">
                  {[53, 5353, 5002, 8053].map((port) => (
                    <button
                      key={port}
                      onClick={() => {
                        const value = String(port);
                        setCustomPort(value);
                        const error = validatePort(value);
                        setPortError(error);
                      }}
                      className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                        parseInt(customPort) === port
                          ? 'bg-blue-100 border-blue-300 text-blue-700'
                          : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {port} {port === 53 ? '(standard)' : port < 1000 ? '(privileged)' : '(user)'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Statistics Card */}
        {dnsStatus.server?.stats && (
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Query Statistics</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-sm font-medium text-blue-600">Total Queries</div>
                <div className="text-2xl font-bold text-blue-900">{dnsStatus.server.stats.totalQueries}</div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-sm font-medium text-green-600">Cache Size</div>
                <div className="text-2xl font-bold text-green-900">{dnsStatus.server.stats.cacheSize}</div>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="text-sm font-medium text-purple-600">Active Providers</div>
                <div className="text-2xl font-bold text-purple-900">{Object.keys(dnsStatus.server.stats.providers || {}).length}</div>
              </div>
            </div>

            {/* Provider Statistics */}
            {dnsStatus.server.stats.providers && (
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-3">Provider Performance</h3>
                <div className="space-y-3">
                  {Object.entries(dnsStatus.server.stats.providers).map(([provider, stats]: [string, any]) => (
                    <div key={provider} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-medium text-gray-900 capitalize">{provider}</div>
                        <div className="text-sm text-gray-500">
                          {stats.failureRate > 0 ? `${(stats.failureRate * 100).toFixed(1)}% failure rate` : 'No failures'}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Total:</span>
                          <span className="ml-2 font-mono">{stats.totalQueries}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">This hour:</span>
                          <span className="ml-2 font-mono">{stats.hourlyQueries}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Failures:</span>
                          <span className="ml-2 font-mono">{stats.failures}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Configuration Card */}
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Configuration</h2>
          
          <div className="space-y-4">
            {dnsStatus.config && (
              <>
                {dnsStatus.config.isPrivilegedPort && !dnsStatus.config.canUseLowPorts && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex">
                      <div className="text-red-600 mr-3">🚫</div>
                      <div>
                        <h3 className="text-sm font-medium text-red-800">Privileged Port Warning</h3>
                        <p className="text-sm text-red-700 mt-1">
                          Port {dnsStatus.config.port} requires administrator privileges. 
                          {dnsStatus.config.platform === 'win32' 
                            ? ' Run as Administrator to use this port.' 
                            : ' Run with sudo to use this port.'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {dnsStatus.config.isPrivilegedPort && dnsStatus.config.canUseLowPorts && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex">
                      <div className="text-green-600 mr-3">✅</div>
                      <div>
                        <h3 className="text-sm font-medium text-green-800">Privileged Port Access</h3>
                        <p className="text-sm text-green-700 mt-1">
                          Running with administrator privileges. Port {dnsStatus.config.port} is available.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {!dnsStatus.config.isPrivilegedPort && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex">
                      <div className="text-blue-600 mr-3">ℹ️</div>
                      <div>
                        <h3 className="text-sm font-medium text-blue-800">Port Configuration</h3>
                        <p className="text-sm text-blue-700 mt-1">
                          Currently using port {dnsStatus.config.port}. For standard DNS port 53, 
                          {dnsStatus.config.platform === 'win32' 
                            ? ' run as Administrator.' 
                            : ' run with sudo privileges.'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex">
                <div className="text-blue-600 mr-3">ℹ️</div>
                <div>
                  <h3 className="text-sm font-medium text-blue-800">How it works</h3>
                  <p className="text-sm text-blue-700 mt-1">
                    The DNS proxy intercepts DNS queries and intelligently routes them between NextDNS (DoH) and Cloudflare to minimize NextDNS usage while maintaining performance.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-700">DNS Providers (in order of preference)</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• NextDNS (DNS-over-HTTPS) - Primary with usage optimization</li>
                <li>• Cloudflare (1.1.1.1) - High performance fallback</li>
                <li>• Google DNS (8.8.8.8) - Secondary fallback</li>
                <li>• OpenDNS - Additional fallback</li>
              </ul>
            </div>
          </div>
        </div>

      </div>
    </PageContainer>
  );
}