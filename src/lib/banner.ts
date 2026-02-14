import trianglify from "trianglify";

export const createTrianglifyBannerBackground = (seed: string) => {
  try {
    const pattern = trianglify({
      width: 1600,
      height: 420,
      cellSize: 92,
      variance: 0.8,
      seed
    });
    const svg = pattern.toSVG();
    const serializer = typeof XMLSerializer !== "undefined" ? new XMLSerializer() : null;
    const svgMarkup = serializer ? serializer.serializeToString(svg) : svg.outerHTML;
    const dataUrl = `data:image/svg+xml,${encodeURIComponent(svgMarkup)}`;
    return `url("${dataUrl}")`;
  } catch {
    return "linear-gradient(135deg, #0f766e 0%, #1d4ed8 100%)";
  }
};
