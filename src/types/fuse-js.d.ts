declare module "fuse.js" {
  interface FuseKeyOption<T> {
    name: keyof T | string;
    weight?: number;
  }

  interface FuseOptions<T> {
    keys?: Array<FuseKeyOption<T> | keyof T | string>;
    threshold?: number;
    ignoreLocation?: boolean;
    minMatchCharLength?: number;
  }

  interface FuseResult<T> {
    item: T;
    refIndex: number;
    score?: number;
  }

  interface FuseSearchOptions {
    limit?: number;
  }

  export default class Fuse<T> {
    constructor(list: readonly T[], options?: FuseOptions<T>);
    search(pattern: string, options?: FuseSearchOptions): FuseResult<T>[];
  }
}
