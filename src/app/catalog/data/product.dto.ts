// Shape of a product in the TheBrainApi contract. Today it is identical to the view model.
export interface ProductDto {
  readonly code: string;
  readonly name: string;
  readonly brand: string;
  readonly ean: string | null;
  readonly presentation: string;
  readonly classification: {
    readonly department: string;
    readonly subDepartment: string;
    readonly category: string;
    readonly subCategory: string;
  };
  readonly supplier: { readonly id: string; readonly name: string } | null;
}
