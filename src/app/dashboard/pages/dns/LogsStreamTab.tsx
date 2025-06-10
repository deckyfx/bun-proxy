import { Table, type TableColumn } from "@app/components/index";
import type { LogEntry } from "@src/dns/drivers/logs/BaseDriver";

interface LogsStreamTabProps {
  logs: LogEntry[];
  connected: boolean;
  tableColumns: TableColumn<LogEntry>[];
  onRowClick: (log: LogEntry) => void;
}

export default function LogsStreamTab({ 
  logs, 
  connected, 
  tableColumns, 
  onRowClick 
}: LogsStreamTabProps) {
  return (
    <div>
      {/* Stream Tab Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center gap-2 text-gray-700">
          <span className="material-icons text-lg">stream</span>
          <span className="font-medium">Real-time DNS Events</span>
          <span className="text-sm text-gray-500">
            ({logs.length}/100)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              connected ? "bg-green-500" : "bg-red-500"
            }`}
          ></div>
          <span className="text-sm text-gray-500">
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </div>

      {/* Stream Table */}
      <Table
        columns={tableColumns}
        data={logs}
        rowClassName={(log: LogEntry) =>
          log.type === "server_event" ? "bg-yellow-50" : ""
        }
        emptyMessage={
          connected
            ? "No logs available. Start the DNS server to see activity."
            : "Connecting to log stream..."
        }
        onRowClick={onRowClick}
      />
    </div>
  );
}