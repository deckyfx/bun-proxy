import { useEffect, useState } from "react";
import { PageContainer } from "../components/PageContainer";
import { useDNSStore } from "@app/stores/dnsStore";
import DNSControl from "./dns/DNSControl";
import DNSConfig from "./dns/DNSConfig";
import DNSDriver from "./dns/DNSDriver";

export default function DNS() {
  const {
    status: dnsStatus,
    fetchStatus,
    fetchConfig,
  } = useDNSStore();

  const [isPolling, setIsPolling] = useState(false);

  useEffect(() => {
    // Initial fetch
    fetchStatus();
    fetchConfig();
  }, [fetchStatus, fetchConfig]);

  useEffect(() => {
    // Start/stop polling DNS status based on server status
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
        <DNSControl />
        <DNSConfig />
        <DNSDriver />
      </div>
    </PageContainer>
  );
}