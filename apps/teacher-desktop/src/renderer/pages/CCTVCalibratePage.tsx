// ============================================================
// SecureAssess Teacher Desktop — CCTV 4-Corner Calibration
// Click the 4 corners of each row/bench to define seat zones.
// ============================================================

import { useRef, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { Card, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { useExamStore } from "../store/examStore";
import { useTeacherSocket } from "../hooks/useTeacherSocket";
import { EVENTS } from "@secureassess/shared";
import { cn } from "../lib/utils";
import toast from "react-hot-toast";

interface Point { x: number; y: number; }
interface Zone { systemNo: string; polygon: Point[]; }

export default function CCTVCalibratePage() {
  const { id = "" } = useParams();
  const { socket }  = useTeacherSocket();
  const cctvFrame   = useExamStore((s) => s.cctvFrame);
  const cctvConn    = useExamStore((s) => s.cctvConnected);

  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const imgRef      = useRef<HTMLImageElement>(null);

  const [zones, setZones]           = useState<Zone[]>([]);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [currentSystem, setCurrentSystem] = useState("SYS-01");
  const [cameraSource, setCameraSource]   = useState("0");
  const [frameW, setFrameW]         = useState(1280);
  const [frameH, setFrameH]         = useState(720);
  const [saving, setSaving]         = useState(false);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = frameW / rect.width;
    const scaleY = frameH / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top)  * scaleY;

    const newPoints = [...currentPoints, { x: Math.round(x), y: Math.round(y) }];
    setCurrentPoints(newPoints);

    if (newPoints.length === 4) {
      setZones((z) => [...z, { systemNo: currentSystem, polygon: newPoints }]);
      setCurrentPoints([]);
      // Auto-advance system number
      const match = currentSystem.match(/\d+/);
      if (match) {
        const next = parseInt(match[0], 10) + 1;
        setCurrentSystem(`SYS-${String(next).padStart(2, "0")}`);
      }
      toast.success(`Zone for ${currentSystem} defined`);
    }
  }, [currentPoints, currentSystem, frameW, frameH]);

  const handleSave = async () => {
    if (zones.length === 0) { toast.error("Define at least one zone"); return; }
    setSaving(true);
    try {
      if (socket) {
        socket.emit(EVENTS.CCTV_SAVE_CALIBRATION, {
          examId: id,
          cameraSource,
          frameWidth: frameW,
          frameHeight: frameH,
          zones,
        }, (resp: any) => {
          if (resp.success) toast.success(`${zones.length} calibration zones saved`);
          else toast.error(resp.error ?? "Save failed");
        });
      } else {
        toast.error("Not connected to server");
      }
    } finally { setSaving(false); }
  };

  const handleDeleteZone = (systemNo: string) => {
    setZones((z) => z.filter((zone) => zone.systemNo !== systemNo));
  };

  return (
    <AppShell title="CCTV Calibration" subtitle="Click 4 corners per seat zone to define perspective boundaries">
      <div className="p-5 grid grid-cols-3 gap-5">
        {/* Left: config */}
        <div className="col-span-1 space-y-4">
          <Card>
            <CardHeader title="Camera Source" />
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Source</label>
                <input value={cameraSource} onChange={(e) => setCameraSource(e.target.value)}
                  className="w-full bg-[#0B1120] border border-[#374151] rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-cobalt-500"
                  placeholder="0 or rtsp://..." />
                <p className="text-[10px] text-slate-600 mt-1">Use 0/1 for USB webcam, or rtsp://… for IP camera</p>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-slate-400 mb-1 block">Width</label>
                  <input type="number" value={frameW} onChange={(e) => setFrameW(Number(e.target.value))}
                    className="w-full bg-[#0B1120] border border-[#374151] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cobalt-500" />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-slate-400 mb-1 block">Height</label>
                  <input type="number" value={frameH} onChange={(e) => setFrameH(Number(e.target.value))}
                    className="w-full bg-[#0B1120] border border-[#374151] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cobalt-500" />
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Drawing Tool" />
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Current System</label>
                <input value={currentSystem} onChange={(e) => setCurrentSystem(e.target.value.toUpperCase())}
                  className="w-full bg-[#0B1120] border border-[#374151] rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-cobalt-500"
                  placeholder="SYS-01" />
              </div>
              <div className="bg-[#0B1120] rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-1">Progress</p>
                <div className="flex gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className={cn(
                      "flex-1 h-2 rounded-full",
                      i < currentPoints.length ? "bg-cobalt-500" : "bg-[#1F2937]"
                    )} />
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  {currentPoints.length === 0 ? "Click top-left corner" :
                   currentPoints.length === 1 ? "Click top-right corner" :
                   currentPoints.length === 2 ? "Click bottom-right corner" :
                   "Click bottom-left corner"}
                </p>
              </div>
              {currentPoints.length > 0 && (
                <Button size="xs" variant="ghost" onClick={() => setCurrentPoints([])}>Reset corners</Button>
              )}
            </div>
          </Card>

          {/* Zone list */}
          <Card>
            <CardHeader title={`Zones (${zones.length})`} />
            <div className="p-2 space-y-1">
              {zones.length === 0 && <p className="text-xs text-slate-600 p-2 italic">No zones yet</p>}
              {zones.map((z) => (
                <div key={z.systemNo} className="flex items-center justify-between px-3 py-2 bg-[#0B1120] rounded-lg">
                  <span className="text-xs font-mono text-cobalt-400">{z.systemNo}</span>
                  <span className="text-[10px] text-slate-500">{z.polygon.length} pts</span>
                  <button onClick={() => handleDeleteZone(z.systemNo)} className="text-red-500 hover:text-red-400 text-xs">✕</button>
                </div>
              ))}
            </div>
          </Card>

          <Button className="w-full" onClick={handleSave} loading={saving} disabled={zones.length === 0}>
            Save Calibration
          </Button>
        </div>

        {/* Right: live feed + canvas overlay */}
        <div className="col-span-2">
          <Card className="overflow-hidden">
            <CardHeader title="Live Preview"
              subtitle={cctvConn ? "CCTV service connected" : "CCTV service not connected — using static preview"}
            />
            <div className="relative bg-[#0B1120] select-none">
              {cctvFrame ? (
                <img ref={imgRef} src={`data:image/jpeg;base64,${cctvFrame}`}
                  alt="CCTV" className="w-full object-cover" />
              ) : (
                <div className="w-full aspect-video flex items-center justify-center">
                  <div className="text-center">
                    <svg className="w-10 h-10 text-slate-700 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d="M15 10l4.553-2.069A1 1 0 0121 8.869v6.262a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <p className="text-sm text-slate-600">No camera feed</p>
                    <p className="text-xs text-slate-700 mt-1">Start the CCTV vision service to see live preview</p>
                  </div>
                </div>
              )}

              {/* SVG overlay for drawn zones */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox={`0 0 ${frameW} ${frameH}`} preserveAspectRatio="none">
                {zones.map((zone) => {
                  const pts = zone.polygon.map((p) => `${p.x},${p.y}`).join(" ");
                  return (
                    <g key={zone.systemNo}>
                      <polygon points={pts} fill="rgba(59,130,246,0.15)" stroke="#3B82F6" strokeWidth="2" />
                      <text x={zone.polygon[0]!.x + 4} y={zone.polygon[0]!.y + 14}
                        fill="#3B82F6" fontSize="14" fontFamily="monospace" fontWeight="bold">
                        {zone.systemNo}
                      </text>
                    </g>
                  );
                })}
                {/* In-progress points */}
                {currentPoints.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r="6" fill="#F59E0B" stroke="#fff" strokeWidth="2" />
                ))}
                {currentPoints.length >= 2 && (
                  <polyline
                    points={currentPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none" stroke="#F59E0B" strokeWidth="2" strokeDasharray="6 4"
                  />
                )}
              </svg>

              {/* Clickable canvas */}
              <canvas ref={canvasRef} onClick={handleCanvasClick}
                width={frameW} height={frameH}
                className="absolute inset-0 w-full h-full cursor-crosshair opacity-0" />
            </div>
            <div className="px-4 py-2.5 border-t border-[#1F2937] text-xs text-slate-500">
              Click to place corners. 4 clicks = one zone. Zones auto-advance system number.
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
