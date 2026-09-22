export type AluminumPrintScope = "current-system" | "all-systems";

export type AluminumPrintInputRow = {
  stt: number;
  color: string;
  systemId: string;
  systemName: string;
  code: string;
  description: string;
  image?: string | null;
  quantity: number | string | null | undefined;
  unitPrice: number | string | null | undefined;
};

export type AluminumPrintInputSystem = {
  systemId: string;
  systemName: string;
  color: string;
  rows: AluminumPrintInputRow[];
};

export type AluminumPrintRow = {
  stt: number;
  color: string;
  systemId: string;
  systemName: string;
  code: string;
  description: string;
  image?: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type AluminumPrintSystemSection = {
  systemId: string;
  systemName: string;
  color: string;
  rows: AluminumPrintRow[];
  totalQuantity: number;
  totalAmount: number;
};

export type AluminumPrintModel = {
  title: string;
  generatedAt: string;
  scope: AluminumPrintScope;
  sections: AluminumPrintSystemSection[];
  totalQuantity: number;
  totalAmount: number;
  rowCount: number;
};
