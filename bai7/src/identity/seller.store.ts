import { Injectable } from '@nestjs/common';

export interface Seller {
  id: string;
  name: string;
  /** Kieu string (khong phai Plan) vi du lieu that co the bi hong; IdentityService se kiem tra. */
  plan: string;
}

export interface ApiKey {
  key: string;
  sellerId: string;
  revokedAt: string | null;
}

/** Du lieu mau de demo - moi tinh huong kiem thu co san mot khoa. */
const seed = (): { sellers: Seller[]; apiKeys: ApiKey[] } => ({
  sellers: [
    { id: 'seller-free', name: 'Shop Free', plan: 'free' },
    { id: 'seller-pro', name: 'Shop Pro', plan: 'pro' },
    { id: 'seller-ent', name: 'Shop Enterprise', plan: 'enterprise' },
    { id: 'seller-upgrade', name: 'Shop Nang Cap', plan: 'free' },
  ],
  apiKeys: [
    { key: 'sk_free_demo', sellerId: 'seller-free', revokedAt: null },
    { key: 'sk_pro_demo', sellerId: 'seller-pro', revokedAt: null },
    { key: 'sk_ent_demo', sellerId: 'seller-ent', revokedAt: null },
    { key: 'sk_upgrade_demo', sellerId: 'seller-upgrade', revokedAt: null },
    // Khoa cu cua chinh nha ban hang Enterprise, da bi thu hoi.
    { key: 'sk_ent_revoked', sellerId: 'seller-ent', revokedAt: '2026-10-01T00:00:00.000Z' },
  ],
});

/**
 * Kho nha ban hang + API key (thay cho database). Moi request doc truc tiep tu day, khong cache,
 * nen doi goi / thu hoi khoa co hieu luc ngay o request ke tiep.
 */
@Injectable()
export class SellerStore {
  private sellers = new Map<string, Seller>();
  private apiKeys = new Map<string, ApiKey>();

  constructor() {
    this.reset();
  }

  findKey(key: string): ApiKey | undefined {
    return this.apiKeys.get(key);
  }

  findSeller(id: string): Seller | undefined {
    return this.sellers.get(id);
  }

  listSellers() {
    return [...this.sellers.values()].map((s) => ({
      ...s,
      apiKeys: [...this.apiKeys.values()].filter((k) => k.sellerId === s.id),
    }));
  }

  changePlan(sellerId: string, plan: string): Seller | undefined {
    const seller = this.sellers.get(sellerId);
    if (seller) seller.plan = plan;
    return seller;
  }

  revokeKey(key: string, at = new Date()): ApiKey | undefined {
    const apiKey = this.apiKeys.get(key);
    if (apiKey && !apiKey.revokedAt) apiKey.revokedAt = at.toISOString();
    return apiKey;
  }

  reset(): void {
    const { sellers, apiKeys } = seed();
    this.sellers = new Map(sellers.map((s) => [s.id, { ...s }]));
    this.apiKeys = new Map(apiKeys.map((k) => [k.key, { ...k }]));
  }
}
