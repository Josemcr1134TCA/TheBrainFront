import { InjectionToken } from '@angular/core';
import { ProductDto } from './product.dto';

// Synthetic demo products (no real data). Same structure as the approved prototype: 45 products, deliberately out of
// code order so the port has to sort. DEMO0012 and DEMO0015 share an EAN, DEMO0018 has no EAN and DEMO0007 has no supplier.

const KINDS = [
  { name: 'Caramelo duro', department: 'Confitería', subDepartment: 'Dulces', category: 'Caramelos', subCategory: 'Duros' },
  { name: 'Gomitas', department: 'Confitería', subDepartment: 'Dulces', category: 'Gomitas', subCategory: 'Frutales' },
  { name: 'Paleta', department: 'Confitería', subDepartment: 'Dulces', category: 'Paletas', subCategory: 'Sólidas' },
  { name: 'Chocolatina', department: 'Confitería', subDepartment: 'Chocolates', category: 'Barras', subCategory: 'Con leche' },
  { name: 'Bombones', department: 'Confitería', subDepartment: 'Chocolates', category: 'Rellenos', subCategory: 'Surtidos' },
  { name: 'Papas fritas', department: 'Botanas', subDepartment: 'Salado', category: 'Papas', subCategory: 'Rizadas' },
  { name: 'Cacahuates', department: 'Botanas', subDepartment: 'Salado', category: 'Semillas', subCategory: 'Horneados' },
  { name: 'Galleta', department: 'Botanas', subDepartment: 'Horneado', category: 'Galletas', subCategory: 'Dulces' },
  { name: 'Barra de cereal', department: 'Botanas', subDepartment: 'Horneado', category: 'Barras', subCategory: 'Cereal' },
] as const;
const VARIANTS = ['original', 'mini', 'familiar', 'mix', 'pack'] as const;
const BRANDS = ['Marca demo A', 'Marca demo B', 'Marca demo C', 'Marca demo D'] as const;
const SUPPLIERS = [
  { id: 'supplier-demo-a', name: 'Proveedor demo A' },
  { id: 'supplier-demo-b', name: 'Proveedor demo B' },
  { id: 'supplier-demo-c', name: 'Proveedor demo C' },
] as const;
const PRESENTATIONS = ['Caja 12 pzas', 'Paquete 6 pzas', 'Bolsa 500 g', 'Frasco 300 g', 'Bolsa 250 g'] as const;

// EAN-13 with prefix 20 (internal use) and a correct check digit, from the demo number.
function demoEan(n: number): string {
  const first12 = `2000000000${String(n).padStart(2, '0')}`;
  const sum = [...first12].reduce((acc, digit, i) => acc + Number(digit) * (i % 2 === 0 ? 1 : 3), 0);
  return first12 + String((10 - (sum % 10)) % 10);
}

function demoProduct(n: number): ProductDto {
  const kind = KINDS[(n - 1) % KINDS.length];
  const ean = n === 18 ? null : demoEan(n === 15 ? 12 : n); // 15 repeats the EAN of 12; 18 has none
  return {
    code: `DEMO${String(n).padStart(4, '0')}`,
    name: `${kind.name} ${VARIANTS[Math.floor((n - 1) / KINDS.length)]}`,
    brand: BRANDS[n % BRANDS.length],
    ean,
    presentation: PRESENTATIONS[(n - 1) % PRESENTATIONS.length],
    classification: {
      department: kind.department,
      subDepartment: kind.subDepartment,
      category: kind.category,
      subCategory: kind.subCategory,
    },
    supplier: n === 7 ? null : SUPPLIERS[n % SUPPLIERS.length], // 7 has no supplier
  };
}

// 17 is coprime with 46, so this visits every number from 1 to 45 once, out of order.
export const PRODUCTS_FIXTURE: readonly ProductDto[] = Array.from({ length: 45 }, (_, i) => demoProduct(((i + 1) * 17) % 46));

/** Data the in-memory adapter serves. Tests replace it with other lists. */
export const PRODUCT_SEED = new InjectionToken<readonly ProductDto[]>('PRODUCT_SEED', {
  factory: () => PRODUCTS_FIXTURE,
});
