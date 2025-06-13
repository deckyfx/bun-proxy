import { FloatingLabelInput, RippleButton, CollapsibleCard, Select } from "@app/components/index";
import { Switch } from "@radix-ui/themes";
import { useEffect } from "react";
import { useDNSStore } from "@app/stores/dnsStore";

export default function DNSConfig() {
  const {
    status: dnsStatus,
    config: dnsConfig,
    testLoading,
    testResult,
    applyLoading,
    testDnsConfig,
    updateConfig,
    applyConfig,
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
    <CollapsibleCard title="Configuration">
      <div className="space-y-6">
        {/* NextDNS Config ID | Test Button | Result */}
        <div className="flex items-center gap-4">
          <div className="w-[200px]">
            <FloatingLabelInput
              label="NextDNS Config ID"
              value={dnsConfig.nextdnsConfigId || ""}
              onChange={(e) => updateConfig({ nextdnsConfigId: e.target.value })}
            />
          </div>
          <div className="flex-shrink-0">
            <RippleButton
              variant="soft"
              color="blue"
              onClick={handleTestDnsConfig}
              loading={testLoading}
              disabled={!dnsConfig.nextdnsConfigId}
            >
              <span className="material-icons">cloud</span>
              <span>Test</span>
            </RippleButton>
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
          <div className="flex items-center gap-3">
            <Switch
              checked={dnsConfig.enableWhitelist}
              onCheckedChange={(checked: boolean) => {
                updateConfig({ enableWhitelist: checked });
              }}
              size="2"
            />
            <label className="text-sm font-medium text-gray-700">
              Enable Whitelist Mode
            </label>
          </div>

          {/* Secondary DNS Resolver - only show when whitelist is enabled */}
          {dnsConfig.enableWhitelist && (
            <div>
              <Select
                label="Secondary DNS Resolver"
                value={dnsConfig.secondaryDns}
                onChange={(value) => {
                  updateConfig({
                    secondaryDns: value as "cloudflare" | "google" | "opendns",
                  });
                }}
                options={[
                  { value: "cloudflare", label: "Cloudflare (1.1.1.1)" },
                  { value: "google", label: "Google DNS (8.8.8.8)" },
                  { value: "opendns", label: "OpenDNS" },
                ]}
              />
            </div>
          )}
        </div>

        {/* Apply Configuration Button - only show when server is running */}
        {dnsStatus.enabled && (
          <div className="pt-4 border-t border-gray-200">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <p className="text-sm text-gray-600">
                  Apply configuration changes to the DNS resolver without restarting the server.
                </p>
              </div>
              <div className="flex-shrink-0">
                <RippleButton
                  variant="solid"
                  color="green"
                  onClick={applyConfig}
                  loading={applyLoading}
                >
                  <span className="material-icons">refresh</span>
                  <span>Apply Config</span>
                </RippleButton>
              </div>
            </div>
          </div>
        )}
      </div>
    </CollapsibleCard>
  );
}