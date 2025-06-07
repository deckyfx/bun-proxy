import {
  Button,
  FloatingLabelInput,
  Card,
  Select,
  Switch,
} from "@app_components/index";
import { useState, useEffect } from "react";
import { PageContainer } from "../components/PageContainer";
import { useDNSStore } from "@app/stores/dnsStore";

export default function DNS() {
  const {
    status: dnsStatus,
    config: dnsConfig,
    loading: dnsLoading,
    testLoading,
    testResult,
    fetchStatus,
    fetchConfig,
    startServer,
    stopServer,
    testDnsConfig,
    updateConfig,
  } = useDNSStore();

  const [customPort, setCustomPort] = useState<string>("");
  const [portError, setPortError] = useState<string>("");
  const [nextdnsConfigId, setNextdnsConfigId] = useState<string>("");
  const [isPolling, setIsPolling] = useState(false);

  // Initialize form values from config
  useEffect(() => {
    // Update port if it's different from default and form hasn't been manually changed
    if (dnsConfig.port) {
      setCustomPort(String(dnsConfig.port));
    }
    // Update NextDNS config ID if available
    if (dnsConfig.nextdnsConfigId) {
      setNextdnsConfigId(dnsConfig.nextdnsConfigId);
    }
  }, [dnsConfig.port, dnsConfig.nextdnsConfigId]);

  const validatePort = (port: string): string => {
    const portNum = parseInt(port);

    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      return "Port must be between 1 and 65535";
    }

    if (portNum < 1000 && !dnsConfig.canUseLowPorts) {
      const privilegeMsg =
        dnsConfig.platform === "win32"
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

    try {
      if (dnsStatus.enabled) {
        await stopServer();
      } else {
        await startServer({
          port: parseInt(customPort),
          enableWhitelist: dnsConfig.enableWhitelist,
          secondaryDns: dnsConfig.secondaryDns,
          nextdnsConfigId: nextdnsConfigId || undefined,
        });
      }
    } catch (error) {
      console.error("Failed to toggle DNS server:", error);
      alert("Failed to toggle DNS server");
    }
  };

  const handleTestDnsConfig = async () => {
    await testDnsConfig(nextdnsConfigId);
  };

  useEffect(() => {
    // Initial fetch
    fetchStatus();
    fetchConfig();
  }, [fetchStatus, fetchConfig]);

  useEffect(() => {
    // Start/stop polling based on server status
    if (dnsStatus.enabled && !isPolling) {
      setIsPolling(true);
      const interval = setInterval(fetchStatus, 10000);
      return () => {
        clearInterval(interval);
        setIsPolling(false);
      };
    } else if (!dnsStatus.enabled && isPolling) {
      setIsPolling(false);
    }
  }, [dnsStatus.enabled, isPolling, fetchStatus]);

  return (
    <PageContainer title="DNS Proxy Server">
      <div className="space-y-6">
        {/* DNS Proxy Server */}
        <Card title="DNS Proxy Server">
          <div className="flex items-center gap-4">
            {/* Port Input */}
            <div className="flex-1">
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

            {/* Start/Stop Button */}
            <div className="flex-shrink-0">
              <Button
                variant={dnsStatus.enabled ? "secondary" : "primary"}
                size="lg"
                onClick={toggleDnsServer}
                isLoading={dnsLoading}
                icon={dnsStatus.enabled ? "stop" : "play_arrow"}
                className="min-w-[140px]"
              >
                {dnsStatus.enabled ? "Stop Server" : "Start Server"}
              </Button>
            </div>

            {/* Status */}
            <div className="flex-shrink-0">
              <div className="text-center">
                <span
                  className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${
                    dnsStatus.enabled
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {dnsStatus.enabled ? "Running" : "Stopped"}
                </span>
                {dnsStatus.enabled && dnsStatus.server && (
                  <p className="text-xs text-gray-500 mt-1">
                    Port: {dnsStatus.server.port}
                  </p>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Configuration Card */}
        <Card title="Configuration">
          <div className="space-y-6">
            {/* NextDNS Config ID | Test Button | Result */}
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <FloatingLabelInput
                  label="NextDNS Config ID"
                  type="text"
                  value={nextdnsConfigId}
                  onChange={(e) => setNextdnsConfigId(e.target.value)}
                  disabled={dnsStatus.enabled}
                />
              </div>
              <div className="flex-shrink-0">
                <Button
                  variant="secondary"
                  size="md"
                  onClick={handleTestDnsConfig}
                  isLoading={testLoading}
                  icon="play_arrow"
                  disabled={!nextdnsConfigId}
                >
                  Test
                </Button>
              </div>
              <div className="flex-1">
                {testResult && (
                  <div className="p-3 rounded-lg bg-gray-50 text-sm">
                    {testResult}
                  </div>
                )}
              </div>
            </div>

            {/* Enable Whitelist Mode */}
            <div className="space-y-4">
              <Switch
                label="Enable Whitelist Mode"
                checked={dnsConfig.enableWhitelist}
                onChange={(checked) => {
                  updateConfig({ enableWhitelist: checked });
                }}
                disabled={dnsStatus.enabled}
                tooltip="Whitelist mode allows you to control which domains use NextDNS filtering. Non-whitelisted domains will be resolved using your selected secondary DNS provider, helping you manage NextDNS query limits effectively."
                tooltipPosition="top"
              />

              {/* Secondary DNS Resolver - only show when whitelist is enabled */}
              {dnsConfig.enableWhitelist && (
                <div>
                  <Select
                    label="Secondary DNS Resolver"
                    value={dnsConfig.secondaryDns}
                    onChange={(value) => {
                      if (!dnsStatus.enabled) {
                        updateConfig({
                          secondaryDns: value as "cloudflare" | "google" | "opendns",
                        });
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
          </div>
        </Card>

        {/* Management Card */}
        <Card title="Management">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Button
              variant="secondary"
              size="md"
              icon="list"
              onClick={() => console.log("Manage Whitelist")}
              className="w-full justify-start"
            >
              Whitelist
            </Button>
            <Button
              variant="secondary"
              size="md"
              icon="block"
              onClick={() => console.log("Manage Blacklist")}
              className="w-full justify-start"
            >
              Blacklist
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
              Logs
            </Button>
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
