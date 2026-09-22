/** Vite asset import: file .docx dưới dạng URL. */
declare module '*.docx?url' {
  const url: string;
  export default url;
}
