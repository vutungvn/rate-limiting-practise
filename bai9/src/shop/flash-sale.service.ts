import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';

export interface Product {
  id: string;
  name: string;
  price: number;
  flashPrice: number;
  stock: number;
}

export interface Order {
  orderId: string;
  accountId: string;
  productId: string;
  quantity: number;
  createdAt: string;
}

const seedProducts = (): Product[] => [
  { id: 'iphone-17-flash', name: 'iPhone 17 – Flash Sale 11/11', price: 29_990_000, flashPrice: 11_110_000, stock: 500 },
];

/** Nghiep vu flash sale (thay cho database): ton kho, tao don, chong dat trung khi khach bam 2 lan. */
@Injectable()
export class FlashSaleService {
  private products = new Map<string, Product>();
  private orders = new Map<string, Order>();
  private byIdempotencyKey = new Map<string, string>();

  constructor() {
    this.reset();
  }

  getProduct(productId: string): Product {
    const product = this.products.get(productId);
    if (!product) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: `Không có sản phẩm flash sale ${productId}` });
    return product;
  }

  /** Don da tao bang cung ve hanh trinh (khach bam "Dat hang" 2 lan) -> tra lai don cu, khong tao don moi. */
  findByIdempotencyKey(key: string): Order | undefined {
    const orderId = this.byIdempotencyKey.get(key);
    return orderId ? this.orders.get(orderId) : undefined;
  }

  placeOrder(input: { accountId: string; productId: string; quantity: number; idempotencyKey: string }): Order {
    const product = this.getProduct(input.productId);
    if (product.stock < input.quantity) {
      throw new ConflictException({ code: 'SOLD_OUT', message: `Sản phẩm chỉ còn ${product.stock}.` });
    }
    product.stock -= input.quantity;
    const order: Order = {
      orderId: `ord_${randomBytes(5).toString('hex')}`,
      accountId: input.accountId,
      productId: input.productId,
      quantity: input.quantity,
      createdAt: new Date().toISOString(),
    };
    this.orders.set(order.orderId, order);
    this.byIdempotencyKey.set(input.idempotencyKey, order.orderId);
    return order;
  }

  reset(): void {
    this.products = new Map(seedProducts().map((p) => [p.id, p]));
    this.orders.clear();
    this.byIdempotencyKey.clear();
  }
}
