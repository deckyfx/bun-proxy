import { Button, Select, Table, type TableColumn } from "@app/components/index";
import type { LogEntry } from "@src/dns/drivers/logs/BaseDriver";

interface LogsHistoryTabProps {
  content: LogEntry[] | null;
  loading: boolean;
  error: string | null;
  currentDriver: any;
  tableColumns: TableColumn<LogEntry>[];
  filters: {
    type: string;
    level: string;
    domain: string;
    provider: string;
    success: string;
    limit: number;
  };
  onFiltersChange: (filters: any) => void;
  onClearFilters: () => void;
  onFetchHistory: () => void;
  onRowClick: (log: LogEntry) => void;
}

export default function LogsHistoryTab({
  content,
  loading,
  error,
  currentDriver,
  tableColumns,
  filters,
  onFiltersChange,
  onClearFilters,
  onFetchHistory,
  onRowClick
}: LogsHistoryTabProps) {
  return (
    <div>
      {/* History Tab Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center gap-2 text-gray-700">
          <span className="material-icons text-lg">history</span>
          <span className="font-medium">Log History</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={onClearFilters}
            className="text-gray-600"
          >
            <span className="material-icons text-sm mr-1">clear</span>
            Clear Filters
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onFetchHistory}
          >
            <span className="material-icons text-sm mr-1">refresh</span>
            Refresh
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onFetchHistory}
          >
            <span className="material-icons text-sm mr-1">search</span>
            Apply
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Select
            label="Type"
            value={filters.type}
            onChange={(value) => onFiltersChange((prev: any) => ({ ...prev, type: value }))}
            options={[
              { value: "", label: "All Types" },
              { value: "request", label: "Request" },
              { value: "response", label: "Response" },
              { value: "server_event", label: "Server Event" },
            ]}
          />
          <Select
            label="Level"
            value={filters.level}
            onChange={(value) => onFiltersChange((prev: any) => ({ ...prev, level: value }))}
            options={[
              { value: "", label: "All Levels" },
              { value: "info", label: "Info" },
              { value: "warn", label: "Warn" },
              { value: "error", label: "Error" },
            ]}
          />
          <Select
            label="Domain"
            value={filters.domain}
            onChange={(value) => onFiltersChange((prev: any) => ({ ...prev, domain: value }))}
            options={[
              { value: "", label: "All Domains" },
              { value: "google.com", label: "google.com" },
              { value: "cloudflare.com", label: "cloudflare.com" },
            ]}
          />
          <Select
            label="Provider"
            value={filters.provider}
            onChange={(value) => onFiltersChange((prev: any) => ({ ...prev, provider: value }))}
            options={[
              { value: "", label: "All Providers" },
              { value: "cloudflare", label: "Cloudflare" },
              { value: "google", label: "Google" },
              { value: "cache", label: "Cache" },
              { value: "blacklist", label: "Blacklist" },
            ]}
          />
          <Select
            label="Success"
            value={filters.success}
            onChange={(value) => onFiltersChange((prev: any) => ({ ...prev, success: value }))}
            options={[
              { value: "", label: "All Results" },
              { value: "true", label: "Success" },
              { value: "false", label: "Failed" },
            ]}
          />
          <Select
            label="Limit"
            value={filters.limit.toString()}
            onChange={(value) => onFiltersChange((prev: any) => ({ ...prev, limit: parseInt(value) }))}
            options={[
              { value: "50", label: "50 entries" },
              { value: "100", label: "100 entries" },
              { value: "200", label: "200 entries" },
              { value: "500", label: "500 entries" },
            ]}
          />
        </div>
      </div>

      {/* History Table */}
      <Table
        columns={tableColumns}
        data={content || []}
        rowClassName={(log: LogEntry) =>
          log.type === "server_event" ? "bg-yellow-50" : ""
        }
        emptyMessage={
          loading
            ? "Loading history..."
            : error
            ? `Error loading history: ${error}`
            : currentDriver?.implementation === "console"
            ? "ConsoleDriver has no persistence. Switch to InMemoryDriver or FileDriver to view history."
            : "No history available. Click Refresh to load logs from the current driver."
        }
        onRowClick={onRowClick}
      />
    </div>
  );
}