import type { SmartHealthAuditLogFilters, SmartHealthExportDataset } from "@/lib/smart-health-api";
import { ExportDataDialog } from "./ExportDataDialog";

interface ExportReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dataset?: SmartHealthExportDataset;
  filters?: SmartHealthAuditLogFilters;
  organizationId?: string;
}

export function ExportReportDialog({
  open,
  onOpenChange,
  dataset = "clinical_bundle",
  filters,
  organizationId,
}: ExportReportDialogProps) {
  return (
    <ExportDataDialog
      open={open}
      onOpenChange={onOpenChange}
      variant="report"
      dataset={dataset}
      filters={filters}
      organizationId={organizationId}
    />
  );
}
