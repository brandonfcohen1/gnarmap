declare module "upng-js" {
  export function encode(
    imgs: ArrayBuffer[],
    w: number,
    h: number,
    cnum: number,
    dels?: number[]
  ): ArrayBuffer;

  export function decode(buffer: ArrayBuffer): {
    width: number;
    height: number;
    depth: number;
    ctype: number;
    frames: Array<{
      rect: { x: number; y: number; width: number; height: number };
      delay: number;
      dispose: number;
      blend: number;
    }>;
    tabs: Record<string, unknown>;
    data: ArrayBuffer;
  };

  export function toRGBA8(img: ReturnType<typeof decode>): ArrayBuffer[];
}
