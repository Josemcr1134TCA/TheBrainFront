// View model of a product: master data only (no costs, discounts or status). Design EP00-TBR-003 §3.2.
export interface Product {
  /** Internal code, unique. Screens call it «Código». */
  readonly code: string;
  readonly name: string;
  readonly brand: string;
  /** May repeat between products: it does not identify the row. */
  readonly ean: string | null;
  readonly presentation: string;
  readonly classification: {
    readonly department: string;
    readonly subDepartment: string;
    readonly category: string;
    readonly subCategory: string;
  };
  /** Null means the product has no supplier; none is invented. */
  readonly supplier: { readonly id: string; readonly name: string } | null;
}
