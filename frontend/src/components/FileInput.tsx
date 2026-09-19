import { useRef, useState } from "react";
import { FileUp, X } from "lucide-react";

export function FileInput({ file, onChange, label = "Evidence file", hint = "Photo, PDF, report — any file. It is hashed in your browser." }: {
  file: File | null; onChange: (f: File | null) => void; label?: string; hint?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div>
      <label className="label">{label}</label>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); onChange(e.dataTransfer.files?.[0] ?? null); }}
        onClick={() => ref.current?.click()}
        className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-4 py-5 transition ${over ? "border-forest-500 bg-forest-50" : "border-forest-900/15 bg-white hover:border-forest-400"}`}
      >
        <FileUp className="h-6 w-6 shrink-0 text-forest-600" />
        <div className="min-w-0 flex-1 text-sm">
          {file ? (<><div className="truncate font-medium text-forest-900">{file.name}</div><div className="text-xs text-forest-800/60">{(file.size / 1024).toFixed(1)} KB</div></>) : (<><div className="font-medium text-forest-900">Drop a file or click to browse</div><div className="text-xs text-forest-800/60">{hint}</div></>)}
        </div>
        {file && <button type="button" onClick={(e) => { e.stopPropagation(); onChange(null); if (ref.current) ref.current.value = ""; }} className="rounded-full p-1 text-forest-900/50 hover:bg-forest-100"><X className="h-4 w-4" /></button>}
        <input ref={ref} type="file" className="hidden" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
      </div>
    </div>
  );
}
