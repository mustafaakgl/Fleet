declare module 'piexifjs' {
  export const ImageIFD: Record<string, number>;
  export const ExifIFD: Record<string, number>;
  export function dump(exifObj: Record<string, Record<number, string>>): string;
  export function insert(exifBytes: string, dataUrl: string): string;
}
