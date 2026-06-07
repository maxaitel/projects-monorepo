"use client";

import {
  Download,
  Image as ImageIcon,
  RefreshCcw,
  Shuffle,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { ChangeEvent, DragEvent, useCallback, useEffect, useRef, useState } from "react";

import {
  formatDimensions,
  renderUnsettledImage,
  RenderMeta,
  UnsettleSettings,
} from "@/lib/image-processing";

const DEMO_IMAGE = "/demo-church.png";

const DEFAULT_SETTINGS: UnsettleSettings = {
  crushSize: 24,
  unsettling: 78,
  seed: 184729,
  displacement: 68,
  edgeGain: 74,
  chroma: 46,
};

function formatBytes(bytes?: number) {
  if (!bytes) {
    return "demo image";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function makeSeed() {
  return Math.floor(100000 + Math.random() * 899999);
}

export function UnsettlingApp() {
  const [settings, setSettings] = useState<UnsettleSettings>(DEFAULT_SETTINGS);
  const [imageSrc, setImageSrc] = useState(DEMO_IMAGE);
  const [imageName, setImageName] = useState("demo-church.png");
  const [imageBytes, setImageBytes] = useState<number | undefined>();
  const [dragging, setDragging] = useState(false);
  const [renderMeta, setRenderMeta] = useState<RenderMeta | null>(null);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState("");
  const [isRendering, setIsRendering] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const crushedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const outputCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const renderCurrent = useCallback(() => {
    const image = imageRef.current;
    const crushedCanvas = crushedCanvasRef.current;
    const outputCanvas = outputCanvasRef.current;

    if (!image || !crushedCanvas || !outputCanvas) {
      return;
    }

    setIsRendering(true);
    setStatus("Reconstructing");

    window.requestAnimationFrame(() => {
      try {
        const meta = renderUnsettledImage(
          image,
          crushedCanvas,
          outputCanvas,
          settings,
        );
        setRenderMeta(meta);
        setStatus("Output ready");
        setError("");
      } catch (renderError) {
        setError(
          renderError instanceof Error
            ? renderError.message
            : "Could not process this image.",
        );
        setStatus("Failed");
      } finally {
        setIsRendering(false);
      }
    });
  }, [settings]);

  useEffect(() => {
    let cancelled = false;
    const image = new Image();

    image.onload = () => {
      if (cancelled) {
        return;
      }

      imageRef.current = image;
      renderCurrent();
    };

    image.onerror = () => {
      if (!cancelled) {
        setError("Could not load this image.");
        setStatus("Failed");
      }
    };

    image.src = imageSrc;

    return () => {
      cancelled = true;
    };
  }, [imageSrc, renderCurrent]);

  useEffect(() => {
    if (!imageRef.current) {
      return;
    }

    const timeout = window.setTimeout(renderCurrent, 90);
    return () => window.clearTimeout(timeout);
  }, [renderCurrent]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  const loadFile = useCallback((file?: File) => {
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Use a PNG, JPEG, WebP, or other browser-readable image.");
      return;
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }

    const nextUrl = URL.createObjectURL(file);
    objectUrlRef.current = nextUrl;
    setImageSrc(nextUrl);
    setImageName(file.name);
    setImageBytes(file.size);
    setStatus("Loading image");
    setError("");
  }, []);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    loadFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    loadFile(event.dataTransfer.files?.[0]);
  };

  const resetDemo = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    setImageSrc(DEMO_IMAGE);
    setImageName("demo-church.png");
    setImageBytes(undefined);
    setStatus("Loading demo");
    setError("");
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
  };

  const updateSetting =
    (key: keyof UnsettleSettings) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = Number(event.target.value);
      setSettings((current) => ({
        ...current,
        [key]: Number.isFinite(value) ? value : current[key],
      }));
    };

  const downloadOutput = () => {
    const canvas = outputCanvasRef.current;

    if (!canvas) {
      return;
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        setError("Could not export the output image.");
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const baseName = imageName.replace(/\.[^.]+$/, "") || "image";
      link.href = url;
      link.download = `${baseName}-unsettled-${settings.seed}.png`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  const previewStyle = {
    "--preview-aspect": renderMeta
      ? `${renderMeta.outputWidth} / ${renderMeta.outputHeight}`
      : "1 / 1",
  } as React.CSSProperties;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="Make Image Unsettling">
          <span>MAKE IMAGE</span>
          <strong>UNSETTLING</strong>
        </div>
        <div className="domain">MakeImageUnsettling.com</div>
      </header>

      <section className="workspace" aria-label="Image unsettling workspace">
        <aside className="control-panel">
          <section className="panel-section" aria-labelledby="input-title">
            <h2 id="input-title">Input</h2>
            <label
              className={dragging ? "drop-zone is-dragging" : "drop-zone"}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                className="file-input"
                type="file"
                accept="image/*"
                onChange={handleInputChange}
              />
              <Upload aria-hidden="true" size={30} />
              <span>Drop image here</span>
              <small>or click to upload</small>
            </label>

            <div className="file-row">
              <ImageIcon aria-hidden="true" size={18} />
              <span className="file-name" title={imageName}>
                {imageName}
              </span>
              <span>{formatBytes(imageBytes)}</span>
              <button type="button" aria-label="Use demo image" onClick={resetDemo}>
                <X aria-hidden="true" size={16} />
              </button>
            </div>
          </section>

          <section className="panel-section" aria-labelledby="controls-title">
            <h2 id="controls-title">Controls</h2>

            <div className="control-group">
              <div className="control-label">
                <label htmlFor="crush-size">Crush size</label>
                <output htmlFor="crush-size">{settings.crushSize}px</output>
              </div>
              <input
                id="crush-size"
                type="range"
                min="4"
                max="64"
                step="1"
                value={settings.crushSize}
                onChange={updateSetting("crushSize")}
              />
              <div className="ticks" aria-hidden="true">
                <span>4</span>
                <span>16</span>
                <span>32</span>
                <span>64</span>
              </div>
            </div>

            <div className="control-group">
              <div className="control-label">
                <label htmlFor="unsettling">Unsettling amount</label>
                <output htmlFor="unsettling">{settings.unsettling}%</output>
              </div>
              <input
                id="unsettling"
                type="range"
                min="0"
                max="100"
                step="1"
                value={settings.unsettling}
                onChange={updateSetting("unsettling")}
              />
              <div className="ticks" aria-hidden="true">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>

            <div className="seed-row">
              <label htmlFor="seed">Seed</label>
              <input
                id="seed"
                type="number"
                min="1"
                max="999999"
                value={settings.seed}
                onChange={updateSetting("seed")}
              />
              <button
                type="button"
                className="icon-button"
                title="Random seed"
                aria-label="Random seed"
                onClick={() =>
                  setSettings((current) => ({ ...current, seed: makeSeed() }))
                }
              >
                <Shuffle aria-hidden="true" size={18} />
              </button>
            </div>

            <details className="advanced">
              <summary>Advanced options</summary>
              <div className="control-group">
                <div className="control-label">
                  <label htmlFor="displacement">Warp</label>
                  <output htmlFor="displacement">{settings.displacement}%</output>
                </div>
                <input
                  id="displacement"
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={settings.displacement}
                  onChange={updateSetting("displacement")}
                />
              </div>
              <div className="control-group">
                <div className="control-label">
                  <label htmlFor="edge-gain">False detail</label>
                  <output htmlFor="edge-gain">{settings.edgeGain}%</output>
                </div>
                <input
                  id="edge-gain"
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={settings.edgeGain}
                  onChange={updateSetting("edgeGain")}
                />
              </div>
              <div className="control-group">
                <div className="control-label">
                  <label htmlFor="chroma">Color offset</label>
                  <output htmlFor="chroma">{settings.chroma}%</output>
                </div>
                <input
                  id="chroma"
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={settings.chroma}
                  onChange={updateSetting("chroma")}
                />
              </div>
            </details>
          </section>

          <section className="actions" aria-label="Actions">
            <button
              type="button"
              className="primary-action"
              onClick={renderCurrent}
              disabled={isRendering}
            >
              <Sparkles aria-hidden="true" size={20} />
              Generate
            </button>
            <button type="button" onClick={resetSettings}>
              <RefreshCcw aria-hidden="true" size={18} />
              Reset
            </button>
            <button type="button" className="download-action" onClick={downloadOutput}>
              <Download aria-hidden="true" size={19} />
              Download output
            </button>
          </section>

          <p className="storage-note">
            Outputs are not stored. This prototype uses a local canvas pipeline,
            not a hosted neural model.
          </p>
        </aside>

        <section className="preview-panel">
          <div className="preview-header">
            <div>
              <h1>Resolution hallucination bench</h1>
              <p>{status}</p>
            </div>
            <div className="seed-readout">Seed: {settings.seed}</div>
          </div>

          {error ? (
            <div className="error-message" role="alert">
              {error}
            </div>
          ) : null}

          <div className="comparison-grid">
            <figure className="image-stage" style={previewStyle}>
              <figcaption>
                <span>Crushed</span>
                <em>
                  {renderMeta
                    ? formatDimensions(renderMeta.crushWidth, renderMeta.crushHeight)
                    : "loading"}
                </em>
              </figcaption>
              <div className="canvas-frame">
                <canvas ref={crushedCanvasRef} aria-label="Crushed image preview" />
              </div>
            </figure>

            <figure className="image-stage" style={previewStyle}>
              <figcaption>
                <span>Result</span>
                <em>
                  {renderMeta
                    ? formatDimensions(renderMeta.outputWidth, renderMeta.outputHeight)
                    : "loading"}
                </em>
              </figcaption>
              <div className="canvas-frame result-frame">
                <canvas ref={outputCanvasRef} aria-label="Unsettled output preview" />
              </div>
            </figure>
          </div>

          <div className="render-readout">
            <span>
              Source{" "}
              {renderMeta
                ? formatDimensions(renderMeta.sourceWidth, renderMeta.sourceHeight)
                : "loading"}
            </span>
            <span aria-hidden="true">-&gt;</span>
            <span>
              Crush{" "}
              {renderMeta
                ? formatDimensions(renderMeta.crushWidth, renderMeta.crushHeight)
                : "loading"}
            </span>
            <span aria-hidden="true">-&gt;</span>
            <span>
              Output{" "}
              {renderMeta
                ? formatDimensions(renderMeta.outputWidth, renderMeta.outputHeight)
                : "loading"}
            </span>
          </div>
        </section>
      </section>
    </main>
  );
}
