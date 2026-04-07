import { useCallback, useEffect, useRef, useState } from "react";

export interface AnnotationPin {
  x: number; // percentage
  y: number; // percentage
  text: string;
  /** Unique identifier for this pin */
  id: string;
}

export interface AnnotationCaptureData {
  screenshot: string; // base64 data URI
  annotations: AnnotationPin[];
}

interface Props {
  imageUrl: string;
  onCapture?: (data: AnnotationCaptureData) => void;
  /** Called whenever pins change so parent can track them */
  onPinsChange?: (pins: AnnotationPin[]) => void;
}

let _pinIdCounter = 0;
function nextPinId(): string {
  return `pin-${++_pinIdCounter}-${Date.now()}`;
}

export function AnnotationCanvas({ imageUrl, onPinsChange }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [tool, setTool] = useState<"pin" | "pen">("pin");
  const [pins, setPins] = useState<AnnotationPin[]>([]);
  const [activePin, setActivePin] = useState<number | null>(null);
  const [tooltipState, setTooltipState] = useState<{ x: number; y: number; text: string } | null>(null);
  const [pendingPin, setPendingPin] = useState<{ x: number; y: number; pctX: number; pctY: number } | null>(null);
  const [pendingPinText, setPendingPinText] = useState("");
  const pendingPinTextareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingPinRef = useRef<HTMLDivElement>(null);
  const drawHistoryRef = useRef<ImageData[]>([]);
  const isDrawingRef = useRef(false);

  // Resize canvas to match image
  const sizeCanvas = useCallback(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    canvas.width = img.naturalWidth || img.offsetWidth;
    canvas.height = img.naturalHeight || img.offsetHeight;
    canvas.style.width = img.offsetWidth + "px";
    canvas.style.height = img.offsetHeight + "px";
    // Restore drawing
    const ctx = canvas.getContext("2d");
    if (ctx && drawHistoryRef.current.length > 0) {
      ctx.putImageData(drawHistoryRef.current[drawHistoryRef.current.length - 1], 0, 0);
    }
  }, []);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    if (img.complete) sizeCanvas();
    img.addEventListener("load", sizeCanvas);
    window.addEventListener("resize", sizeCanvas);
    return () => {
      img.removeEventListener("load", sizeCanvas);
      window.removeEventListener("resize", sizeCanvas);
    };
  }, [sizeCanvas]);

  function getCanvasCoords(e: React.MouseEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function getPctCoords(e: React.MouseEvent) {
    const wrapper = wrapperRef.current;
    if (!wrapper) return { x: 0, y: 0 };
    const rect = wrapper.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    };
  }

  function saveDrawState() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawHistoryRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  }

  // Pen drawing
  function handleMouseDown(e: React.MouseEvent) {
    if (tool !== "pen") return;
    e.preventDefault();
    isDrawingRef.current = true;
    saveDrawState();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const coords = getCanvasCoords(e);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    ctx.strokeStyle = "#e11d48";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const coords = getCanvasCoords(e);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  }

  function handleMouseUp() {
    if (isDrawingRef.current) {
      isDrawingRef.current = false;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      ctx?.closePath();
    }
  }

  // Pin placement
  function handleCanvasClick(e: React.MouseEvent) {
    if (tool !== "pin") return;
    e.preventDefault();
    const pct = getPctCoords(e);
    const wrapperRect = wrapperRef.current?.getBoundingClientRect();
    if (!wrapperRect) return;
    const pixelX = e.clientX - wrapperRect.left;
    const pixelY = e.clientY - wrapperRect.top;
    setPendingPin({ x: pixelX, y: pixelY, pctX: pct.x, pctY: pct.y });
    setPendingPinText("");
    setTimeout(() => pendingPinTextareaRef.current?.focus(), 0);
  }

  function handleSavePin() {
    if (!pendingPin) return;
    const newPin: AnnotationPin = { x: pendingPin.pctX, y: pendingPin.pctY, text: pendingPinText.trim(), id: nextPinId() };
    setPins((prev) => {
      const next = [...prev, newPin];
      onPinsChange?.(next);
      return next;
    });
    setPendingPin(null);
    setPendingPinText("");
  }

  function handleCancelPin() {
    setPendingPin(null);
    setPendingPinText("");
  }

  function handleUndo() {
    if (drawHistoryRef.current.length > 0) {
      drawHistoryRef.current.pop();
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (drawHistoryRef.current.length > 0) {
          ctx.putImageData(drawHistoryRef.current[drawHistoryRef.current.length - 1], 0, 0);
        }
      }
    } else if (pins.length > 0) {
      setPins((prev) => prev.slice(0, -1));
    }
  }

  function handleClear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    drawHistoryRef.current = [];
    setPins([]);
    onPinsChange?.([]);
    setActivePin(null);
  }

  // Compute tooltip position relative to wrapper when activePin changes
  useEffect(() => {
    if (activePin === null || !wrapperRef.current) {
      setTooltipState(null);
      return;
    }
    const pin = pins[activePin];
    if (!pin || !pin.text) {
      setTooltipState(null);
      return;
    }
    const wrapperRect = wrapperRef.current.getBoundingClientRect();
    setTooltipState({
      x: (pin.x / 100) * wrapperRect.width,
      y: (pin.y / 100) * wrapperRect.height - 20,
      text: pin.text,
    });
  }, [activePin, pins]);

  // Close pending pin popover on outside clicks
  useEffect(() => {
    if (!pendingPin) return;
    function handleDown(e: MouseEvent) {
      if (pendingPinRef.current && !pendingPinRef.current.contains(e.target as Node)) {
        setPendingPin(null);
        setPendingPinText("");
      }
    }
    document.addEventListener("mousedown", handleDown);
    return () => document.removeEventListener("mousedown", handleDown);
  }, [pendingPin]);

  return (
    <div className="relative">
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-3 p-2 bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-700 shadow-sm">
        <ToolButton
          active={tool === "pin"}
          onClick={() => setTool("pin")}
          title="Pin tool: click on the image to add a numbered annotation marker"
          label="Pin"
          icon={"\uD83D\uDCCC"}
        />
        <ToolButton
          active={tool === "pen"}
          onClick={() => setTool("pen")}
          title="Pen tool: draw freehand on the image to highlight areas"
          label="Pen"
          icon={"\u270E"}
        />
        <div className="w-px h-6 bg-stone-300 dark:bg-stone-600 mx-1" />
        <button
          type="button"
          onClick={handleUndo}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
          title="Undo last action"
        >
          <span aria-hidden="true">{"\u21B6"}</span> Undo
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
          title="Clear all annotations and drawings"
        >
          <span aria-hidden="true">{"\u274C"}</span> Clear
        </button>
        <div className="flex-1" />
        <span className="text-xs text-stone-500 dark:text-stone-400">
          {tool === "pin" ? "Click to add pin" : "Draw to annotate"}
        </span>
      </div>

      {/* Canvas area — full width, no sidebar */}
      <div
        ref={wrapperRef}
        className="relative inline-block border border-stone-200 dark:border-stone-700 rounded-lg overflow-hidden bg-stone-100 dark:bg-stone-800 cursor-crosshair"
      >
        <img
          ref={imgRef}
          src={imageUrl}
          alt="Content to annotate"
          className="block max-w-full h-auto select-none"
          draggable={false}
        />
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 w-full h-full"
          style={{ pointerEvents: "auto" }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={handleCanvasClick}
        />
        {/* Pin markers with hover tooltip */}
        <div className="absolute top-0 left-0 w-full h-full" style={{ pointerEvents: "none" }}>
          {pins.map((pin, i) => (
            <div
              key={pin.id}
              className={`annotation-pin ${activePin === i ? "selected" : ""}`}
              data-pin-id={pin.id}
              style={{ left: `${pin.x}%`, top: `${pin.y}%`, pointerEvents: "auto" }}
              role="button"
              aria-label={`Annotation ${i + 1}${pin.text ? `: ${pin.text}` : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                setActivePin(i);
              }}
              onMouseEnter={() => setActivePin(i)}
              onMouseLeave={() => setActivePin(null)}
            >
              {i + 1}
            </div>
          ))}
        </div>

        {/* Tooltip on hover */}
        {tooltipState && !pendingPin && (
          <div
            className="absolute z-50 max-w-xs px-3 py-2 bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 text-xs rounded-lg shadow-lg pointer-events-none"
            style={{
              left: tooltipState.x,
              top: tooltipState.y,
              transform: "translate(-50%, -100%)",
            }}
          >
            <p className="font-medium">{tooltipState.text}</p>
            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-stone-800 dark:border-t-stone-200" />
          </div>
        )}

        {/* Inline pin comment input */}
        {pendingPin && (
          <div
            ref={pendingPinRef}
            className="absolute z-50 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-600 rounded-lg shadow-lg p-3 w-64"
            style={{
              left: pendingPin.x,
              top: pendingPin.y + 10,
            }}
          >
            <textarea
              ref={pendingPinTextareaRef}
              className="w-full min-h-[60px] p-2 border border-stone-300 dark:border-stone-600 rounded-md bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-y"
              placeholder="Add a comment for this pin..."
              value={pendingPinText}
              onChange={(e) => setPendingPinText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSavePin();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  handleCancelPin();
                }
              }}
              onClick={(e) => e.stopPropagation()}
            />
            <div className="flex justify-end gap-2 mt-2">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleCancelPin(); }}
                className="px-3 py-1 text-xs font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleSavePin(); }}
                className="px-3 py-1 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-md transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  title,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  label: string;
  icon: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
        active
          ? "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300"
          : "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700"
      }`}
      aria-pressed={active}
      title={title}
    >
      <span aria-hidden="true">{icon}</span> {label}
    </button>
  );
}

/** Capture function to be called externally to gather annotation data */
export function captureAnnotations(
  imgEl: HTMLImageElement | null,
  canvasEl: HTMLCanvasElement | null,
  pins: AnnotationPin[],
): AnnotationCaptureData | undefined {
  if (!imgEl || !canvasEl) return undefined;

  const captureCanvas = document.createElement("canvas");
  captureCanvas.width = canvasEl.width;
  captureCanvas.height = canvasEl.height;
  const ctx = captureCanvas.getContext("2d");
  if (!ctx) return undefined;

  // Draw original image
  ctx.drawImage(imgEl, 0, 0, canvasEl.width, canvasEl.height);
  // Draw freehand annotations
  ctx.drawImage(canvasEl, 0, 0);

  // Draw pin markers
  for (let i = 0; i < pins.length; i++) {
    const px = (pins[i].x / 100) * canvasEl.width;
    const py = (pins[i].y / 100) * canvasEl.height;
    ctx.beginPath();
    ctx.arc(px, py, 14, 0, 2 * Math.PI);
    ctx.fillStyle = "#e11d48";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1), px, py);
  }

  return {
    screenshot: captureCanvas.toDataURL("image/png"),
    annotations: pins.map((p) => ({
      x: Math.round(p.x * 100) / 100,
      y: Math.round(p.y * 100) / 100,
      text: p.text,
      id: p.id,
    })),
  };
}
