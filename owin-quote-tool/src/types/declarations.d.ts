/** Vite asset import: file .docx dưới dạng URL. */
declare module '*.docx?url' {
  const url: string;
  export default url;
}

/** docxtemplater-image-module-free không kèm type — khai báo tối giản. */
declare module 'docxtemplater-image-module-free' {
  interface ImageModuleOptions {
    centered?: boolean;
    fileType?: 'docx' | 'pptx';
    getImage: (tagValue: string, tagName?: string) => ArrayBuffer;
    getSize: (img: ArrayBuffer, tagValue: string, tagName?: string) => [number, number];
  }
  export default class ImageModule {
    constructor(options: ImageModuleOptions);
  }
}
