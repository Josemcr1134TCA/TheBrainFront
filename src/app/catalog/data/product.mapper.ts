import { Product } from '../model/product';
import { ProductDto } from './product.dto';

/** From the API contract to the view model. Returns a new, frozen product: the source is never shared. */
export function toProduct(dto: ProductDto): Product {
  return Object.freeze({
    code: dto.code,
    name: dto.name,
    brand: dto.brand,
    ean: dto.ean,
    presentation: dto.presentation,
    classification: Object.freeze({
      department: dto.classification.department,
      subDepartment: dto.classification.subDepartment,
      category: dto.classification.category,
      subCategory: dto.classification.subCategory,
    }),
    supplier: dto.supplier === null ? null : Object.freeze({ id: dto.supplier.id, name: dto.supplier.name }),
  });
}
