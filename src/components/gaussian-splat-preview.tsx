import { useEffect, useRef, useState } from "react";
import { html as viewerHtml, css as viewerCss, js as viewerJs } from "@playcanvas/supersplat-viewer";
import type { ExperienceSettings } from "@playcanvas/supersplat-viewer/settings";
import { AlertCircle } from "lucide-react";
import { cn } from "../lib/utils";

const SPLAT_FILE_SUFFIXES = [".ply", ".compressed.ply", ".sog", ".meta.json", ".lod-meta.json"] as const;

const isSupportedSupersplatFileName = (fileName: string) => {
  const normalized = fileName.trim().toLowerCase();
  return SPLAT_FILE_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
};

export const isGaussianSplatFileName = (fileName: string) => isSupportedSupersplatFileName(fileName);

const inferContentType = (fileName: string) => {
  const normalized = fileName.trim().toLowerCase();
  if (normalized.endsWith(".json")) return "application/json";
  return "application/octet-stream";
};

const toBlobPart = (bytes: Uint8Array) => {
  if (bytes.buffer instanceof ArrayBuffer) {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
  return Uint8Array.from(bytes).buffer;
};

const createViewerSettings = (): ExperienceSettings => ({
  version: 2,
  tonemapping: "aces2",
  highPrecisionRendering: false,
  background: {
    color: [2 / 255, 6 / 255, 23 / 255]
  },
  postEffectSettings: {
    sharpness: { enabled: false, amount: 0 },
    bloom: { enabled: false, intensity: 1, blurLevel: 2 },
    grading: { enabled: false, brightness: 0, contrast: 1, saturation: 1, tint: [1, 1, 1] },
    vignette: { enabled: false, intensity: 0.5, inner: 0.3, outer: 0.75, curvature: 1 },
    fringing: { enabled: false, intensity: 0.5 }
  },
  animTracks: [],
  cameras: [
    {
      initial: {
        position: [0, 0, -2],
        target: [0, 0, 0],
        fov: 55
      }
    }
  ],
  annotations: [],
  startMode: "default"
});

interface GaussianSplatPreviewProps {
  fileName: string;
  fileBytes: Uint8Array;
  className?: string;
}

export const GaussianSplatPreview = ({
  fileName,
  fileBytes,
  className
}: GaussianSplatPreviewProps) => {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    const objectUrls: string[] = [];

    const createObjectUrl = (value: BlobPart, type: string) => {
      const url = URL.createObjectURL(new Blob([value], { type }));
      objectUrls.push(url);
      return url;
    };

    const setupViewer = () => {
      setStatus("loading");
      setErrorMessage(null);
      setViewerSrc(null);

      try {
        if (!isSupportedSupersplatFileName(fileName)) {
          throw new Error("Dieses Dateiformat wird von supersplat-viewer hier nicht unterstuetzt.");
        }

        const contentUrl = createObjectUrl(toBlobPart(fileBytes), inferContentType(fileName));
        const settingsUrl = createObjectUrl(JSON.stringify(createViewerSettings()), "application/json");
        const cssUrl = createObjectUrl(viewerCss, "text/css");
        const jsUrl = createObjectUrl(viewerJs, "text/javascript");

        const injectedHtml = viewerHtml
          .replace("./index.css", cssUrl)
          .replace("./index.js", jsUrl)
          .replace(
            "</head>",
            `<script>
window.addEventListener("error", (event) => {
  window.parent.postMessage({ type: "supersplat-error", message: event.message }, "*");
});
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  const message = reason && typeof reason === "object" && "message" in reason ? reason.message : String(reason);
  window.parent.postMessage({ type: "supersplat-error", message }, "*");
});
window.addEventListener("DOMContentLoaded", () => {
  window.parent.postMessage({ type: "supersplat-ready" }, "*");
});
</script></head>`
          );

        const htmlUrl = createObjectUrl(injectedHtml, "text/html");
        const src = `${htmlUrl}?settings=${encodeURIComponent(settingsUrl)}&content=${encodeURIComponent(contentUrl)}`;
        if (!disposed) setViewerSrc(src);
      } catch (error) {
        if (disposed) return;
        setStatus("error");
        setErrorMessage(error instanceof Error ? error.message : "3D-Vorschau konnte nicht geladen werden.");
      }
    };

    const handleMessage = (event: MessageEvent) => {
      if (typeof event.data !== "object" || event.data == null || !("type" in event.data)) return;
      if (event.data.type === "supersplat-ready") {
        setStatus("ready");
      }
      if (event.data.type === "supersplat-error") {
        setStatus("error");
        setErrorMessage(typeof event.data.message === "string" ? event.data.message : "3D-Vorschau konnte nicht geladen werden.");
      }
    };

    window.addEventListener("message", handleMessage);
    setupViewer();

    return () => {
      disposed = true;
      window.removeEventListener("message", handleMessage);
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [fileBytes, fileName]);

  return (
    <div className={cn("relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950", className)}>
      {viewerSrc ? (
        <iframe
          ref={frameRef}
          src={viewerSrc}
          title={`${fileName} preview`}
          className="block h-full min-h-[20rem] w-full border-0"
          allow="fullscreen; xr-spatial-tracking"
        />
      ) : (
        <div className="h-full min-h-[20rem] w-full" />
      )}

      {status === "error" ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/80 px-4 text-center text-slate-200">
          <AlertCircle className="h-6 w-6 text-rose-300" />
          <div className="space-y-1">
            <p className="text-sm font-medium">3D-Vorschau nicht verfuegbar</p>
            <p className="text-xs text-slate-400">{errorMessage ?? "Die Datei konnte nicht als Gaussian Splat geladen werden."}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
};
