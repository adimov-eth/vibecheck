declare module 'node-apple-receipt-verify' {
  export interface VerifyOptions {
    secret?: string;
    excludeSandbox?: boolean;
  }

  export interface ReceiptInfo {
    product_id: string;
    transaction_id: string;
    original_transaction_id: string;
    purchase_date_ms: string;
    expires_date_ms: string;
    [key: string]: any;
  }

  export interface VerifyResult {
    status: number;
    environment: 'Production' | 'Sandbox';
    receipt: any;
    latest_receipt_info?: ReceiptInfo[];
    [key: string]: any;
  }

  export function verifyReceipt(receipt: string, options?: VerifyOptions): Promise<VerifyResult>;
} 