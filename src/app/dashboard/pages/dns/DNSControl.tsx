import { Flex } from "@radix-ui/themes";
import { useState } from "react";
import {
  FloatingLabelNumber,
  RippleButton,
  CollapsibleCard,
} from "@app/components/index";
import { useDNSStore } from "@app/stores/dnsStore";
import { tryAsync } from "@src/utils/try";

export default function DNSControl() {
  const {
    status: dnsStatus,
    config: dnsConfig,
    loading: dnsLoading,
    startServer,
    stopServer,
    updateConfig,
  } = useDNSStore();

  const [portError, setPortError] = useState<string>("");

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
    updateConfig({ port: parseInt(value) || 53 });
    const error = validatePort(value);
    setPortError(error);
  };

  const toggleDnsServer = async () => {
    // Validate port before starting
    if (!dnsStatus.enabled) {
      const error = validatePort(String(dnsConfig.port));
      if (error) {
        setPortError(error);
        return;
      }
    }

    let error;

    if (dnsStatus.enabled) {
      [, error] = await tryAsync(stopServer);
    } else {
      [, error] = await tryAsync(() =>
        startServer({
          port: dnsConfig.port,
          enableWhitelist: dnsConfig.enableWhitelist,
          secondaryDns: dnsConfig.secondaryDns,
          nextdnsConfigId: dnsConfig.nextdnsConfigId,
        })
      );
    }

    if (error) {
      console.error("Failed to toggle DNS server:", error);
      alert("Failed to toggle DNS server");
    }
  };

  return (
    <CollapsibleCard title="DNS Proxy Server">
      <Flex direction="row" gap="3">
        {/* Port Input */}
        <div className="w-[200px]">
          <FloatingLabelNumber
            label="UDP Server Port"
            value={String(dnsConfig.port || 53)}
            onChange={handlePortChange}
            status={portError ? "error" : undefined}
            message={portError}
            min={1}
            max={65535}
            disabled={dnsStatus.enabled}
          />
        </div>

        {/* Start/Stop Button */}
        <div className="flex-shrink-0">
          <RippleButton
            variant="soft"
            color={dnsStatus.enabled ? "red" : "green"}
            onClick={toggleDnsServer}
            loading={dnsLoading}
            className="min-w-[140px]"
          >
            <span className="material-icons">{dnsStatus.enabled ? "stop" : "play_arrow"}</span>
            <span>{dnsStatus.enabled ? "Stop Server" : "Start UDP Server"}</span>
          </RippleButton>
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
      </Flex>
    </CollapsibleCard>
  );
}
