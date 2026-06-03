// Minimal type declaration for `heic2any`, which ships no types of its own.
// It converts HEIC/HEIF image blobs (e.g. iPhone photos) into a web-friendly
// format like JPEG, entirely in the browser.
declare module 'heic2any' {
  interface Heic2AnyOptions {
    blob: Blob;
    toType?: string; // e.g. 'image/jpeg'
    quality?: number; // 0..1
  }
  export default function heic2any(
    options: Heic2AnyOptions,
  ): Promise<Blob | Blob[]>;
}
