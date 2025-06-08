import { Button, FloatingLabelInput, Card, Select, Switch } from "@app_components/index";
import { useState, useEffect } from "react";
import { useDNSStore } from "@app/stores/dnsStore";

export default function DNSConfig() {
  const {
    status: dnsStatus,
    config: dnsConfig,
    testLoading,
    testResult,
    testDnsConfig,
    updateConfig,
  } = useDNSStore();

  // Initialize and update NextDNS config ID through store
  useEffect(() => {
    if (dnsConfig.nextdnsConfigId) {
      updateConfig({ nextdnsConfigId: dnsConfig.nextdnsConfigId });
    }
  }, [dnsConfig.nextdnsConfigId, updateConfig]);

  const handleTestDnsConfig = async () => {
    await testDnsConfig(dnsConfig.nextdnsConfigId || "");
  };

  return (
    <Card title="Configuration">
      <div className="space-y-6">
        {/* NextDNS Config ID | Test Button | Result */}
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <FloatingLabelInput
              label="NextDNS Config ID"
              type="text"
              value={dnsConfig.nextdnsConfigId || ""}
              onChange={(e) => updateConfig({ nextdnsConfigId: e.target.value })}
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
              disabled={!dnsConfig.nextdnsConfigId}
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
  );
}