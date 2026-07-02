import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileUp } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { smartHealthApi } from "../../../lib/smart-health-api";

type Row = { name: string; phone?: string; email?: string; age?: number; gender?: string };
function parseLine(line: string) {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      cells.push(value.trim());
      value = "";
    } else value += char;
  }
  cells.push(value.trim());
  return cells;
}

export default function PatientImportPage() {
  const client = useQueryClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const load = async (file: File) => {
    const lines = (await file.text()).split(/\r?\n/).filter(Boolean);
    if (!lines.length) return;
    const headers = parseLine(lines[0]).map((item) => item.toLowerCase());
    const parsed = lines
      .slice(1)
      .map(parseLine)
      .map((cells) =>
        Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""])),
      )
      .map((item) => ({
        name: item.name || item["họ tên"] || item["ho ten"] || "",
        phone: item.phone || item["số điện thoại"],
        email: item.email,
        age: item.age ? Number(item.age) : undefined,
        gender: item.gender || item["giới tính"],
      }))
      .filter((row) => row.name);
    setRows(parsed);
  };
  const importRows = async () => {
    setBusy(true);
    let completed = 0;
    try {
      for (const row of rows) {
        await smartHealthApi.createPatient(row);
        completed += 1;
      }
      await client.invalidateQueries({ queryKey: ["portal", "patients"] });
      toast.success(`Đã import ${completed} bệnh nhân`);
      setRows([]);
    } catch (error) {
      toast.error(
        `${error instanceof Error ? error.message : "Import thất bại"}. Đã tạo ${completed}/${rows.length} hồ sơ.`,
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <Link to="/portal/patients" className="text-sm text-[#94b8d0] flex gap-2 items-center">
        <ArrowLeft size={15} />
        Bệnh nhân
      </Link>
      <div>
        <h1 className="hero-gradient-text flex gap-2 items-center">
          <FileUp size={22} />
          Import bệnh nhân CSV
        </h1>
        <p className="text-sm text-[#94b8d0]">Cột hỗ trợ: name, phone, email, age, gender.</p>
      </div>
      <label className="glass-panel rounded-2xl p-10 text-center block cursor-pointer border-dashed">
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(event) => event.target.files?.[0] && load(event.target.files[0])}
        />
        <FileUp className="mx-auto text-[#00FFD1] mb-3" />
        <span className="text-white">Chọn file CSV</span>
      </label>
      {rows.length > 0 && (
        <div className="glass-panel rounded-2xl p-5">
          <div className="text-white font-semibold mb-3">Xem trước {rows.length} hồ sơ</div>
          <div className="max-h-72 overflow-auto divide-y divide-white/5">
            {rows.map((row, index) => (
              <div key={`${row.name}-${index}`} className="py-2 text-sm flex justify-between">
                <span className="text-white">{row.name}</span>
                <span className="text-[#94b8d0]">{row.phone || row.email || "—"}</span>
              </div>
            ))}
          </div>
          <button onClick={importRows} disabled={busy} className="premium-button mt-4 w-full">
            {busy ? "Đang import..." : `Import ${rows.length} hồ sơ`}
          </button>
        </div>
      )}
    </div>
  );
}
