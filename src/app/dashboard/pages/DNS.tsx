import { useEffect } from "react";
import { PageContainer } from "../components/PageContainer";
import { useDNSStore } from "@app/stores/dnsStore";
import { useDnsDriverStore } from "@app/stores/dnsDriverStore";
import DNSControl from "./dns/DNSControl";
import DNSConfig from "./dns/DNSConfig";
import DNSDriver from "./dns/DNSDriver";
import DNSTestTool from "./dns/DNSTestTool";

export default function DNS() {
  const {
    status: dnsStatus,
    fetchStatus,
    fetchConfig,
    connectSSE,
    disconnectSSE,
  } = useDNSStore();

  const {
    fetchDrivers,
    connectSSE: connectDriverSSE,
  } = useDnsDriverStore();

  useEffect(() => {
    // Initial fetch
    fetchStatus();
    fetchConfig();
    fetchDrivers();

    // Connect to SSE for real-time updates
    connectSSE();
    const unsubscribeDriverSSE = connectDriverSSE();

    // Cleanup on unmount
    return () => {
      disconnectSSE();
      unsubscribeDriverSSE();
    };
  }, []); // Empty dependency array - run only once on mount

  return (
    <PageContainer title="DNS Proxy Server">
      <div className="space-y-6">
        <DNSControl />
        <DNSConfig />
        <DNSTestTool />
        <DNSDriver />
      </div>
    </PageContainer>
  );
}
