/** Global lightbox opener — kept separate from the React component file for Fast Refresh. */
let globalSrc: string | null = null;
const globalListeners = new Set<() => void>();

export function getImageLightboxSrc(): string | null {
  return globalSrc;
}

export function subscribeImageLightbox(listener: () => void): () => void {
  globalListeners.add(listener);
  return () => {
    globalListeners.delete(listener);
  };
}

export function openImageLightbox(url: string | null | undefined): void {
  if (!url) return;
  globalSrc = url;
  globalListeners.forEach((listener) => listener());
}

export function closeImageLightbox(): void {
  globalSrc = null;
  globalListeners.forEach((listener) => listener());
}
