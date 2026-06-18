import { useEffect, useRef, useState } from "react";
import { AlertCircle, LoaderCircle, Move3D } from "lucide-react";
import { cn } from "../lib/utils";

const SPLAT_EXTENSIONS = ["ply", "sog", "sogs", "spz", "splat", "ksplat"] as const;

const inferSplatExtension = (fileName: string) => {
  const normalized = fileName.trim().toLowerCase();
  const dotIndex = normalized.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === normalized.length - 1) return null;
  const extension = normalized.slice(dotIndex + 1);
  return SPLAT_EXTENSIONS.includes(extension as (typeof SPLAT_EXTENSIONS)[number]) ? extension : null;
};

export const isGaussianSplatFileName = (fileName: string) => inferSplatExtension(fileName) != null;

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let animationFrameId = 0;
    let renderScheduled = false;
    let resizeObserver: ResizeObserver | null = null;
    let cleanupControls: (() => void) | null = null;
    let cleanupRenderer: (() => void) | null = null;
    let cleanupSpark: (() => void) | null = null;
    let cleanupMesh: (() => void) | null = null;

    const renderViewer = async () => {
      setStatus("loading");
      setErrorMessage(null);

      try {
        const [
          THREE,
          { OrbitControls },
          { SparkRenderer, SplatFileType, SplatMesh }
        ] = await Promise.all([
          import("three"),
          import("three/addons/controls/OrbitControls.js"),
          import("@sparkjsdev/spark")
        ]);

        if (disposed) return;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color("#020617");

        const camera = new THREE.PerspectiveCamera(55, 1, 0.01, 1000);
        camera.position.set(0, 0, 2.5);

        const renderer = new THREE.WebGLRenderer({
          antialias: false,
          alpha: false,
          powerPreference: "high-performance"
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        container.replaceChildren(renderer.domElement);

        const renderScene = () => {
          if (disposed) return;
          renderScheduled = false;
          renderer.render(scene, camera);
        };

        const requestRender = () => {
          if (disposed || renderScheduled) return;
          renderScheduled = true;
          animationFrameId = window.requestAnimationFrame(renderScene);
        };

        const updateViewport = () => {
          const nextWidth = Math.max(container.clientWidth, 1);
          const nextHeight = Math.max(container.clientHeight, 1);
          camera.aspect = nextWidth / nextHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(nextWidth, nextHeight, false);
        };

        updateViewport();

        const spark = new SparkRenderer({
          renderer,
          onDirty: requestRender,
          enableLod: true
        });
        scene.add(spark);

        const extension = inferSplatExtension(fileName);
        const fileType =
          extension === "splat"
            ? SplatFileType.SPLAT
            : extension === "ksplat"
              ? SplatFileType.KSPLAT
              : extension === "sog"
                ? SplatFileType.PCSOGSZIP
                : extension === "sogs"
                  ? SplatFileType.PCSOGS
                : undefined;

        const splatMesh = new SplatMesh({
          fileBytes,
          fileName,
          fileType,
          lod: true
        });
        scene.add(splatMesh);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = false;
        controls.rotateSpeed = 0.75;
        controls.zoomSpeed = 0.9;
        controls.panSpeed = 0.8;
        controls.target.set(0, 0, 0);
        controls.addEventListener("change", requestRender);

        cleanupControls = () => {
          controls.removeEventListener("change", requestRender);
          controls.dispose();
        };
        cleanupRenderer = () => renderer.dispose();
        cleanupSpark = () => spark.dispose();
        cleanupMesh = () => splatMesh.dispose();

        await splatMesh.initialized;
        if (disposed) return;

        const bounds = splatMesh.getBoundingBox();
        if (!bounds.isEmpty()) {
          const center = bounds.getCenter(new THREE.Vector3());
          const size = bounds.getSize(new THREE.Vector3());
          const radius = Math.max(size.x, size.y, size.z, 0.25) * 0.65;
          camera.near = Math.max(radius / 100, 0.01);
          camera.far = Math.max(radius * 100, 100);
          camera.position.copy(center.clone().add(new THREE.Vector3(radius * 1.8, radius * 0.6, radius * 1.8)));
          controls.target.copy(center);
          camera.updateProjectionMatrix();
        }

        resizeObserver = new ResizeObserver(() => {
          updateViewport();
          requestRender();
        });
        resizeObserver.observe(container);

        setStatus("ready");
        requestRender();
      } catch (error) {
        if (disposed) return;
        setStatus("error");
        setErrorMessage(error instanceof Error ? error.message : "3D-Vorschau konnte nicht geladen werden");
      }
    };

    void renderViewer();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrameId);
      resizeObserver?.disconnect();
      cleanupControls?.();
      cleanupMesh?.();
      cleanupSpark?.();
      cleanupRenderer?.();
      container.replaceChildren();
    };
  }, [fileBytes, fileName]);

  return (
    <div className={cn("relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950", className)}>
      <div ref={containerRef} className="h-full min-h-[20rem] w-full" />

      {status !== "ready" ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/80 px-4 text-center text-slate-200">
          {status === "error" ? (
            <>
              <AlertCircle className="h-6 w-6 text-rose-300" />
              <div className="space-y-1">
                <p className="text-sm font-medium">3D-Vorschau nicht verfügbar</p>
                <p className="text-xs text-slate-400">{errorMessage ?? "Die Datei konnte nicht als Gaussian Splat geladen werden."}</p>
              </div>
            </>
          ) : (
            <>
              <LoaderCircle className="h-6 w-6 animate-spin text-slate-200" />
              <div className="space-y-1">
                <p className="text-sm font-medium">3D-Vorschau wird geladen</p>
                <p className="text-xs text-slate-400">Spark initialisiert Renderer und dekodiert die Splat-Datei.</p>
              </div>
            </>
          )}
        </div>
      ) : null}

      <div className="pointer-events-none absolute bottom-3 left-3 right-3 rounded-lg border border-white/10 bg-slate-900/75 px-3 py-2 text-xs text-slate-200 backdrop-blur">
        <span className="inline-flex items-center gap-2">
          <Move3D className="h-3.5 w-3.5" />
          Ziehen zum Rotieren, Scrollen zum Zoomen, Rechtsklick zum Verschieben
        </span>
      </div>
    </div>
  );
};
