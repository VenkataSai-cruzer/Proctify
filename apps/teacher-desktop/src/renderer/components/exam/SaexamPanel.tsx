// ============================================================
// SecureAssess — .saexam Portable Bundle Panel
// Export → USB / Import from USB for air-gapped labs
// ============================================================

import { useState } from "react";
import { Card, CardHeader } from "../ui/Card";
import { Button } from "../ui/Button";
import { api } from "../../lib/api";
import { useAuthStore } from "../../store/authStore";
import toast from "react-hot-toast";

interface Props { examId: string; }

export function SaexamPanel({ examId }: Props) {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const serverUrl = useAuthStore((s) => s.serverUrl);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { filename, url } = await api.post<{ filename: string; url: string; bundleHash: string }>(
        `/api/saexam/${examId}/export`
      );

      // In Electron: prompt save-file dialog and download
      if (window.electronAPI) {
        const savePath = await window.electronAPI.saveFileDialog({
          defaultPath: filename,
          filters: [{ name: "SecureAssess Exam Bundle", extensions: ["saexam"] }],
        });
        if (savePath) {
          const res = await fetch(`${serverUrl}${url}`);
          const buf = await res.arrayBuffer();
          await window.electronAPI.writeFile(savePath, Buffer.from(buf));
          toast.success(`Bundle saved: ${savePath.split(/[\\/]/).pop()}`);
        }
      } else {
        // Browser fallback: direct download
        window.open(`${serverUrl}${url}`);
        toast.success(`Export ready: ${filename}`);
      }
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Export failed");
    } finally { setExporting(false); }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      let buffer: ArrayBuffer;
      let name: string;

      if (window.electronAPI) {
        const filePath = await window.electronAPI.openFileDialog([
          { name: "SecureAssess Exam Bundle", extensions: ["saexam"] },
        ]);
        if (!filePath) { setImporting(false); return; }
        const fileBuffer = await window.electronAPI.readFile(filePath);
        buffer = fileBuffer.buffer as ArrayBuffer;
        name   = filePath.split(/[\\/]/).pop() ?? "bundle.saexam";
      } else {
        // Browser: file input
        buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".saexam";
          input.onchange = async () => {
            const f = input.files?.[0];
            if (!f) reject(new Error("No file"));
            else resolve(await f.arrayBuffer());
          };
          input.click();
        });
        name = "bundle.saexam";
      }

      const form = new FormData();
      form.append("bundle", new Blob([buffer]), name);
      const result = await api.upload<{
        imported: boolean; examId: string; questionsImported: number; studentsImported: number;
      }>("/api/saexam/import", form);

      toast.success(
        `Imported: ${result.questionsImported} questions, ${result.studentsImported} students (Exam ID: ${result.examId.slice(0, 8)}…)`
      );
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Import failed");
    } finally { setImporting(false); }
  };

  return (
    <Card>
      <CardHeader
        title="Portable Bundle (.saexam)"
        subtitle="Transfer via USB for air-gapped labs — includes exam, questions, roster & CCTV zones"
      />
      <div className="p-4 flex gap-3">
        <Button
          size="sm" variant="secondary"
          loading={exporting} onClick={handleExport}
          icon={<span>📦</span>}
        >
          Export .saexam
        </Button>
        <Button
          size="sm" variant="secondary"
          loading={importing} onClick={handleImport}
          icon={<span>📥</span>}
        >
          Import .saexam
        </Button>
      </div>
      <p className="px-4 pb-3 text-[10px] text-slate-600">
        Bundles are HMAC-signed. Tampering invalidates the signature and import will be rejected.
        Import auto-upserts — re-importing the same bundle is safe and idempotent.
      </p>
    </Card>
  );
}
