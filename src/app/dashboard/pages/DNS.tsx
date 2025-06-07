import {
  Button,
  FloatingLabelInput,
  Card,
  Select,
  Tooltip,
} from "@app_components/index";
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
      platform: "unknown",
      isPrivilegedPort: true,
      enableWhitelist: false,
      secondaryDns: "cloudflare",
    },
  });
  const [dnsLoading, setDnsLoading] = useState(false);
  const [customPort, setCustomPort] = useState<string>("");
  const [portError, setPortError] = useState<string>("");
  const [isPolling, setIsPolling] = useState(false);

  const fetchDnsStatus = async () => {
    try {
      const response = await fetch("/api/dns/status");
      const data: DNSStatus = await response.json();
      setDnsStatus(data);
      // Initialize custom port with current configured port
      if (!customPort) {
        setCustomPort(String(data.config.port));
      }
    } catch (error) {
      console.error("Failed to fetch DNS status:", error);
    }
  };

  const validatePort = (port: string): string => {
    const portNum = parseInt(port);

    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      return "Port must be between 1 and 65535";
    }

    if (portNum < 1000 && !dnsStatus.config.canUseLowPorts) {
      const privilegeMsg =
        dnsStatus.config.platform === "win32"
          ? "Run as Administrator to use privileged ports (< 1000)"
          : "Run with sudo to use privileged ports (< 1000)";
      return privilegeMsg;
    }

    return "";
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
      const endpoint = dnsStatus.enabled ? "/api/dns/stop" : "/api/dns/start";
      const body = !dnsStatus.enabled
        ? JSON.stringify({
            port: parseInt(customPort),
            enableWhitelist: dnsStatus.config.enableWhitelist,
            secondaryDns: dnsStatus.config.secondaryDns,
          })
        : undefined;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : {},
        body,
      });

      const data: DNSToggleResponse = await response.json();
      setDnsStatus(data.status);
    } catch (error) {
      console.error("Failed to toggle DNS server:", error);
      alert("Failed to toggle DNS server");
    } finally {
      setDnsLoading(false);
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchDnsStatus();
  }, []);

  useEffect(() => {
    // Start/stop polling based on server status
    if (dnsStatus.enabled && !isPolling) {
      setIsPolling(true);
      const interval = setInterval(fetchDnsStatus, 10000);
      return () => {
        clearInterval(interval);
        setIsPolling(false);
      };
    } else if (!dnsStatus.enabled && isPolling) {
      setIsPolling(false);
    }
  }, [dnsStatus.enabled, isPolling]);

  return (
    <PageContainer title="DNS Proxy Server">
      <div className="space-y-6">
        {/* Server Status Card */}
        <Card
          title="Server Status"
          subtitle={
            dnsStatus.enabled
              ? "DNS proxy is running and intercepting queries"
              : "DNS proxy is currently stopped"
          }
        >
          <div className="flex items-center justify-between">
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                dnsStatus.enabled
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800"
              }`}
            >
              {dnsStatus.enabled ? "Running" : "Stopped"}
            </span>
            <Button
              variant={dnsStatus.enabled ? "secondary" : "primary"}
              size="md"
              onClick={toggleDnsServer}
              isLoading={dnsLoading}
              icon={dnsStatus.enabled ? "stop" : "play_arrow"}
            >
              {dnsStatus.enabled ? "Stop Server" : "Start Server"}
            </Button>
          </div>
        </Card>

        {/* Configuration Card */}
        <Card title="Configuration">
          <div className="space-y-8">
            {/* Configuration grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Port Settings */}
              <div>
                <div className="flex items-center space-x-2 mb-2">
                  <label className="text-sm font-medium text-gray-700">
                    Port
                  </label>
                </div>
                <FloatingLabelInput
                  label="DNS Server Port"
                  type="number"
                  value={customPort}
                  onChange={handlePortChange}
                  error={portError}
                  min="1"
                  max="65535"
                  disabled={dnsStatus.enabled}
                />
              </div>

              {/* Whitelist Toggle */}
              <div>
                <div className="flex items-center space-x-2 mb-2">
                  <label className="text-sm font-medium text-gray-700">
                    Enable Whitelist Mode
                  </label>
                  <Tooltip
                    content="Whitelist mode allows you to control which domains use NextDNS filtering. Non-whitelisted domains will be resolved using your selected secondary DNS provider, helping you manage NextDNS query limits effectively."
                    position="right"
                  />
                </div>
                <button
                  type="button"
                  disabled={dnsStatus.enabled}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 ${
                    dnsStatus.config.enableWhitelist
                      ? "bg-blue-600"
                      : "bg-gray-200"
                  } ${
                    dnsStatus.enabled ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                  onClick={() => {
                    if (!dnsStatus.enabled) {
                      setDnsStatus((prev) => ({
                        ...prev,
                        config: {
                          ...prev.config,
                          enableWhitelist: !prev.config.enableWhitelist,
                        },
                      }));
                    }
                  }}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      dnsStatus.config.enableWhitelist
                        ? "translate-x-5"
                        : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Secondary DNS - only show when whitelist is enabled */}
              {dnsStatus.config.enableWhitelist && (
                <div>
                  <Select
                    label="Secondary DNS Provider"
                    value={dnsStatus.config.secondaryDns}
                    onChange={(value) => {
                      if (!dnsStatus.enabled) {
                        setDnsStatus((prev) => ({
                          ...prev,
                          config: {
                            ...prev.config,
                            secondaryDns: value as
                              | "cloudflare"
                              | "google"
                              | "opendns",
                          },
                        }));
                      }
                    }}
                    disabled={dnsStatus.enabled}
                    options={[
                      { value: "cloudflare", label: "Cloudflare (1.1.1.1)" },
                      { value: "google", label: "Google DNS (8.8.8.8)" },
                      { value: "opendns", label: "OpenDNS" },
                    ]}
                  />
                </div>
              )}
            </div>

            {/* Port privilege warning */}
            {customPort &&
              parseInt(customPort) < 1000 &&
              !dnsStatus.enabled && (
                <div
                  className={`mt-4 border rounded-lg p-4 ${
                    dnsStatus.config.canUseLowPorts
                      ? "bg-green-50 border-green-200"
                      : "bg-yellow-50 border-yellow-200"
                  }`}
                >
                  <div className="flex">
                    <div
                      className={`mr-3 ${
                        dnsStatus.config.canUseLowPorts
                          ? "text-green-600"
                          : "text-yellow-600"
                      }`}
                    >
                      {dnsStatus.config.canUseLowPorts ? "✅" : "⚠️"}
                    </div>
                    <div>
                      <h3
                        className={`text-sm font-medium ${
                          dnsStatus.config.canUseLowPorts
                            ? "text-green-800"
                            : "text-yellow-800"
                        }`}
                      >
                        Privileged Port {parseInt(customPort)}
                      </h3>
                      <p
                        className={`text-sm mt-1 ${
                          dnsStatus.config.canUseLowPorts
                            ? "text-green-700"
                            : "text-yellow-700"
                        }`}
                      >
                        {dnsStatus.config.canUseLowPorts
                          ? `Running with administrator privileges. Port ${customPort} is available.`
                          : `Ports below 1000 require administrator privileges. ${
                              dnsStatus.config.platform === "win32"
                                ? "Run as Administrator"
                                : "Run with sudo"
                            } to use port ${customPort}.`}
                      </p>
                    </div>
                  </div>
                </div>
              )}

            {/* Management Buttons */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Management Tools
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Button
                  variant="secondary"
                  size="md"
                  icon="list"
                  onClick={() => console.log("Manage Whitelist")}
                  className="w-full justify-start"
                >
                  Manage Whitelist
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  icon="block"
                  onClick={() => console.log("Manage Blacklist")}
                  className="w-full justify-start"
                >
                  Manage Blacklist
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  icon="storage"
                  onClick={() => console.log("Cache List")}
                  className="w-full justify-start"
                >
                  Cache List
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  icon="description"
                  onClick={() => console.log("Show Logs")}
                  className="w-full justify-start"
                >
                  Show Logs
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Statistics Card */}
        {dnsStatus.server?.stats && (
          <Card title="Query Statistics">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-sm font-medium text-blue-600">
                  Total Queries
                </div>
                <div className="text-2xl font-bold text-blue-900">
                  {dnsStatus.server.stats.totalQueries}
                </div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-sm font-medium text-green-600">
                  Cache Size
                </div>
                <div className="text-2xl font-bold text-green-900">
                  {dnsStatus.server.stats.cacheSize}
                </div>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="text-sm font-medium text-purple-600">
                  Active Providers
                </div>
                <div className="text-2xl font-bold text-purple-900">
                  {Object.keys(dnsStatus.server.stats.providers || {}).length}
                </div>
              </div>
            </div>

            {/* Provider Statistics */}
            {dnsStatus.server.stats.providers && (
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-3">
                  Provider Performance
                </h3>
                <div className="space-y-3">
                  {Object.entries(dnsStatus.server.stats.providers).map(
                    ([provider, stats]: [string, any]) => (
                      <div key={provider} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-medium text-gray-900 capitalize">
                            {provider}
                          </div>
                          <div className="text-sm text-gray-500">
                            {stats.failureRate > 0
                              ? `${(stats.failureRate * 100).toFixed(
                                  1
                                )}% failure rate`
                              : "No failures"}
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <span className="text-gray-500">Total:</span>
                            <span className="ml-2 font-mono">
                              {stats.totalQueries}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500">This hour:</span>
                            <span className="ml-2 font-mono">
                              {stats.hourlyQueries}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500">Failures:</span>
                            <span className="ml-2 font-mono">
                              {stats.failures}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
