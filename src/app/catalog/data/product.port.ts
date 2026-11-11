import { PagedListPort } from '../../core/data/paged-list.port';
import { Product } from '../model/product';

/** The only piece of data/ that screens know. Sorting and paging are done behind it, never by the view. */
export abstract class ProductPort extends PagedListPort<Product> {}
