declare module "trianglify" {
  export interface TrianglifyPattern {
    toSVG: () => SVGSVGElement;
  }

  export interface TrianglifyOptions {
    width?: number;
    height?: number;
    cellSize?: number;
    variance?: number;
    seed?: string;
  }

  const trianglify: (options?: TrianglifyOptions) => TrianglifyPattern;
  export default trianglify;
}
