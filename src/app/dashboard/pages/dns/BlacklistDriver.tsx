import {
  RippleButton,
  CollapsibleCard,
  Select,
  FloatingLabelInput,
} from "@app/components/index";
import { Table, type TableColumn } from "@app/components/index";
import { useState, useEffect } from "react";
import { DRIVER_TYPES, type DriversResponse } from "@src/types/driver";
import type { BlacklistEntry as ServerBlacklistEntry } from "@src/dns/drivers/blacklist/BaseDriver";
import { useDnsBlacklistStore } from "@app/stores/dnsBlacklistStore";
import { useDialogStore } from "@app/stores/dialogStore";
import { tryAsync } from "@src/utils/try";

interface BlacklistDriverProps {
  drivers: DriversResponse | null;
  loading: boolean;
}

type BlacklistEntry = ServerBlacklistEntry;

const formatDriverName = (name: string): string => {
  if (!name) return "Unknown";

  const specialCases: Record<string, string> = {
    inmemory: "InMemory",
    file: "File",
    sqlite: "SQLite",
  };

  return (
    specialCases[name.toLowerCase()] ||
    name.charAt(0).toUpperCase() + name.slice(1)
  );
};

const tableColumns: TableColumn<ServerBlacklistEntry>[] = [
  {
    key: "domain",
    label: "Domain",
    className: "font-mono",
    render: (value) => (
      <div className="max-w-48 truncate" title={String(value || "")}>
        {String(value || "")}
      </div>
    ),
  },
  {
    key: "reason",
    label: "Reason",
    render: (value) => (
      <div className="max-w-32 truncate" title={String(value || "")}>
        {String(value || "") || (
          <span className="text-gray-400">No reason</span>
        )}
      </div>
    ),
  },
  {
    key: "category",
    label: "Category",
    render: (value) => {
      const stringValue = String(value || "");
      if (!stringValue) return <span className="text-gray-400">-</span>;

      const categoryColors: Record<string, string> = {
        ads: "bg-red-100 text-red-800",
        malware: "bg-red-100 text-red-800",
        phishing: "bg-orange-100 text-orange-800",
        social: "bg-blue-100 text-blue-800",
        gaming: "bg-purple-100 text-purple-800",
        adult: "bg-pink-100 text-pink-800",
        logs: "bg-gray-100 text-gray-800",
        manual: "bg-green-100 text-green-800",
      };

      const colorClass =
        categoryColors[stringValue.toLowerCase()] ||
        "bg-gray-100 text-gray-800";

      return (
        <span
          className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${colorClass}`}
        >
          {stringValue}
        </span>
      );
    },
  },
  {
    key: "source",
    label: "Source",
    render: (value) => {
      const stringValue = String(value || "");
      if (!stringValue) return <span className="text-gray-400">-</span>;

      const sourceIcons: Record<string, string> = {
        manual: "person",
        import: "upload",
        logs: "description",
        api: "api",
      };

      const icon = sourceIcons[stringValue.toLowerCase()] || "help";

      return (
        <div className="flex items-center gap-1">
          <span className="material-icons text-sm text-gray-500">{icon}</span>
          <span className="text-sm capitalize">{stringValue}</span>
        </div>
      );
    },
  },
  {
    key: "addedAt",
    label: "Added",
    render: (value) => {
      if (!value || typeof value !== "number")
        return <span className="text-gray-400">-</span>;
      return (
        <span className="text-sm text-gray-600">
          {new Date(value).toLocaleString()}
        </span>
      );
    },
  },
];

export default function BlacklistDriver({
  drivers,
  loading,
}: BlacklistDriverProps) {
  const [driverForm, setDriverForm] = useState({ driver: "" });
  const [newEntry, setNewEntry] = useState({
    domain: "",
    reason: "",
    category: "manual",
  });
  const [filters, setFilters] = useState({
    domain: "",
    category: "",
    source: "",
    reason: "",
  });
  const {
    setDriver,
    getContent,
    content,
    contentLoading,
    clearContent,
    addEntry,
    removeEntry,
    connectSSE,
    disconnectSSE,
  } = useDnsBlacklistStore();
  const { showConfirm, showCustom, closeDialog } = useDialogStore();

  useEffect(() => {
    if (drivers?.current?.[DRIVER_TYPES.BLACKLIST]) {
      setDriverForm({
        driver:
          drivers.current[DRIVER_TYPES.BLACKLIST].implementation || "inmemory",
      });
    }
  }, [drivers]);

  // Connect to SSE only for data change events
  useEffect(() => {
    connectSSE();
    return () => disconnectSSE();
  }, [connectSSE, disconnectSSE]);

  const handleDriverFormChange = (driver: string) => {
    setDriverForm({ driver });
  };

  const handleSetDriver = async () => {
    await setDriver(driverForm.driver);
  };

  const fetchBlacklistContent = async (customFilters?: typeof filters) => {
    const currentFilters = customFilters || filters;
    const filterConfig = {
      ...(currentFilters.domain && { domain: currentFilters.domain }),
      ...(currentFilters.category && { category: currentFilters.category }),
      ...(currentFilters.source && { source: currentFilters.source }),
      ...(currentFilters.reason && { reason: currentFilters.reason }),
    };
    await getContent(filterConfig);
  };

  const handleClearBlacklist = async () => {
    const confirmed = await showConfirm(
      "Are you sure you want to clear all blacklist entries? This action cannot be undone.",
      {
        title: "Clear Blacklist",
        confirmText: "Clear All",
        cancelText: "Cancel",
      }
    );

    if (confirmed) {
      await clearContent();
      await fetchBlacklistContent();
    }
  };

  const handleAddEntry = async () => {
    if (!newEntry.domain) {
      return;
    }

    const success = await addEntry(
      newEntry.domain,
      newEntry.reason || "Manually added",
      newEntry.category || "manual"
    );

    if (success) {
      setNewEntry({ domain: "", reason: "", category: "manual" });
      await fetchBlacklistContent();
    }
  };

  const handleRemoveEntry = async (domain: string) => {
    const confirmed = await showConfirm(
      `Are you sure you want to remove "${domain}" from the blacklist?`,
      {
        title: "Remove from Blacklist",
        confirmText: "Remove",
        cancelText: "Cancel",
      }
    );

    if (confirmed) {
      const success = await removeEntry(domain);
      if (success) {
        await fetchBlacklistContent();
      }
    }
  };

  const showAddDialog = () => {
    const AddEntryDialog = () => {
      const [formData, setFormData] = useState({
        domain: "",
        reason: "",
        category: "manual",
      });
      const [submitting, setSubmitting] = useState(false);

      const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.domain) return;

        setSubmitting(true);

        const [success, error] = await tryAsync(() =>
          addEntry(
            formData.domain,
            formData.reason || "Manually added",
            formData.category || "manual"
          )
        );

        if (!error && success) {
          await fetchBlacklistContent();
          closeDialog(dialogId);
        }

        setSubmitting(false);
      };

      return (
        <form onSubmit={handleSubmit} className="space-y-4">
          <FloatingLabelInput
            label="Domain"
            value={formData.domain}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, domain: e.target.value }))
            }
            disabled={submitting}
            required
          />
          <FloatingLabelInput
            label="Reason (optional)"
            value={formData.reason}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, reason: e.target.value }))
            }
            disabled={submitting}
          />
          <Select
            label="Category"
            labelPosition="top"
            value={formData.category}
            onChange={(value) =>
              setFormData((prev) => ({ ...prev, category: value }))
            }
            options={[
              { value: "manual", label: "Manual" },
              { value: "ads", label: "Ads" },
              { value: "malware", label: "Malware" },
              { value: "phishing", label: "Phishing" },
              { value: "social", label: "Social Media" },
              { value: "gaming", label: "Gaming" },
              { value: "adult", label: "Adult Content" },
            ]}
          />
          <div className="flex justify-end space-x-3 mt-6">
            <RippleButton
              type="button"
              variant="soft"
              color="gray"
              onClick={() => closeDialog(dialogId)}
              disabled={submitting}
            >
              <span className="material-icons">close</span>
              <span>Cancel</span>
            </RippleButton>
            <RippleButton
              type="submit"
              variant="solid"
              color="blue"
              loading={submitting}
              disabled={submitting || !formData.domain}
            >
              <span className="material-icons">add</span>
              <span>Add to Blacklist</span>
            </RippleButton>
          </div>
        </form>
      );
    };

    const dialogId = showCustom(<AddEntryDialog />, {
      title: "Add Domain to Blacklist",
      showCloseButton: true,
    });
  };

  const availableDrivers = drivers?.available[DRIVER_TYPES.BLACKLIST] || [];
  const currentDriver = drivers?.current[DRIVER_TYPES.BLACKLIST];

  return (
    <div className="space-y-4">
      {/* Driver Configuration */}
      <div className="flex items-end gap-4">
        <div className="flex-1">
          <Select
            label="Driver Implementation"
            labelPosition="top"
            value={driverForm.driver}
            onChange={(value) => handleDriverFormChange(value)}
            options={availableDrivers.map((driver: string) => ({
              value: driver,
              label: formatDriverName(driver),
            }))}
          />
        </div>
        <RippleButton
          variant="solid"
          color="blue"
          onClick={handleSetDriver}
          disabled={!driverForm.driver || loading}
        >
          <span className="material-icons">settings</span>
          <span>Set Driver</span>
        </RippleButton>
      </div>

      {/* Driver Status */}
      <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
        <span className="material-icons text-lg text-gray-600">block</span>
        <div>
          <div className="font-medium text-gray-900">
            Current Driver:{" "}
            {formatDriverName(currentDriver?.implementation || "")}
          </div>
          <div className="text-sm text-gray-500">
            Status:{" "}
            <span
              className={`font-medium ${
                currentDriver?.status === "active"
                  ? "text-green-600"
                  : "text-gray-600"
              }`}
            >
              {currentDriver?.status || "inactive"}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <RippleButton
            variant="soft"
            color="green"
            onClick={() => fetchBlacklistContent()}
            disabled={contentLoading}
          >
            <span className="material-icons">refresh</span>
            <span>{contentLoading ? "Loading..." : "Refresh"}</span>
          </RippleButton>
          <RippleButton variant="solid" color="blue" onClick={() => showAddDialog()}>
            <span className="material-icons">add</span>
            <span>Add Domain</span>
          </RippleButton>
        </div>
        <RippleButton
          variant="soft"
          color="red"
          onClick={handleClearBlacklist}
        >
          <span className="material-icons">clear_all</span>
          <span>Clear Blacklist</span>
        </RippleButton>
      </div>

      {/* Filters */}
      <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-medium text-gray-900 flex items-center gap-2">
            <span className="material-icons text-lg">filter_list</span>
            Filters
          </h4>
          <RippleButton
            variant="soft"
            color="gray"
            onClick={() => {
              setFilters({ domain: "", category: "", source: "", reason: "" });
              fetchBlacklistContent({
                domain: "",
                category: "",
                source: "",
                reason: "",
              });
            }}
          >
            <span className="material-icons">filter_list_off</span>
            <span>Clear Filters</span>
          </RippleButton>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <FloatingLabelInput
            label="Filter by Domain"
            value={filters.domain}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, domain: e.target.value }))
            }
          />
          <Select
            label="Category"
            labelPosition="top"
            value={filters.category}
            onChange={(value) =>
              setFilters((prev) => ({ ...prev, category: value }))
            }
            options={[
              { value: "*", label: "All Categories" },
              { value: "manual", label: "Manual" },
              { value: "ads", label: "Ads" },
              { value: "malware", label: "Malware" },
              { value: "phishing", label: "Phishing" },
              { value: "social", label: "Social Media" },
              { value: "gaming", label: "Gaming" },
              { value: "adult", label: "Adult Content" },
              { value: "logs", label: "From Logs" },
            ]}
          />
          <Select
            label="Source"
            labelPosition="top"
            value={filters.source}
            onChange={(value) =>
              setFilters((prev) => ({ ...prev, source: value }))
            }
            options={[
              { value: "*", label: "All Sources" },
              { value: "manual", label: "Manual" },
              { value: "import", label: "Import" },
              { value: "logs", label: "From Logs" },
              { value: "api", label: "API" },
            ]}
          />
          <div className="flex items-end">
            <RippleButton
              variant="soft"
              color="blue"
              onClick={() => fetchBlacklistContent()}
              className="w-full"
            >
              <span className="material-icons">search</span>
              <span>Apply Filters</span>
            </RippleButton>
          </div>
        </div>
      </div>

      {/* Blacklist Content Table */}
      <div className="border border-gray-200 rounded-lg bg-white">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2 text-gray-700">
            <span className="material-icons text-lg">block</span>
            <span className="font-medium">Blocked Domains</span>
            <span className="text-sm text-gray-500">
              (
              {content && "entries" in content && Array.isArray(content.entries)
                ? content.entries.length
                : 0}{" "}
              domains)
            </span>
          </div>
        </div>

        <Table
          columns={[
            ...tableColumns,
            {
              key: "actions",
              label: "Actions",
              render: (_value, entry) => (
                <button
                  onClick={() => handleRemoveEntry(entry.domain)}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                  title="Remove from blacklist"
                >
                  <span className="material-icons text-sm">delete</span>
                  Remove
                </button>
              ),
            },
          ]}
          data={
            content && "entries" in content && Array.isArray(content.entries)
              ? (content.entries as ServerBlacklistEntry[])
              : []
          }
          loading={contentLoading}
          loadingMessage="Loading blacklist entries..."
          emptyMessage={
            !content || !content.success
              ? "Failed to load blacklist entries"
              : currentDriver?.implementation === "inmemory"
              ? "No domains in blacklist. Add domains manually or import from logs."
              : "No blacklist entries available. Click Refresh to load entries from the current driver."
          }
        />
      </div>
    </div>
  );
}
