/* eslint-disable @typescript-eslint/no-explicit-any */
import LIFX_RAW from 'lifx-lan-client/src/lifx/products.json';

import type { DeviceFeatures, FirmwareVersion } from '../types';

interface RawProductFeatures {
  color?: boolean;
  temperature_range?: number[];
  relays?: boolean;
}

interface RawUpgrade {
  major: number;
  minor: number;
  features?: RawProductFeatures;
}

interface RawProduct {
  pid: number;
  name: string;
  features?: RawProductFeatures;
  upgrades?: RawUpgrade[];
}

const VENDOR = (LIFX_RAW as any[])[0];
const PRODUCTS: RawProduct[] = VENDOR?.products ?? [];
const VENDOR_NAME: string = VENDOR?.name ?? 'LIFX';

function isVersionAtLeast(upgrade: RawUpgrade, fw: FirmwareVersion): boolean {
  return (
    upgrade.major < fw.majorVersion ||
    (upgrade.major === fw.majorVersion && upgrade.minor <= fw.minorVersion)
  );
}

function toFeatures(raw: RawProductFeatures | undefined): DeviceFeatures {
  const range = raw?.temperature_range;
  const hasRange = Array.isArray(range) && range.length === 2 && range[0] !== range[1];
  return {
    color: Boolean(raw?.color),
    hasRelays: Boolean(raw?.relays),
    temperatureRange: hasRange ? [Math.min(...range!), Math.max(...range!)] : undefined,
  };
}

export interface ResolvedProduct {
  productId: number;
  vendorName: string;
  productName: string;
  features: DeviceFeatures;
}

/**
 * Resolve a product's capabilities for a given firmware version, applying any
 * firmware-gated feature upgrades (e.g. extended multizone) declared in the
 * LIFX product database.
 */
export function resolveProduct(
  productId: number | undefined,
  firmware: FirmwareVersion,
): ResolvedProduct | undefined {
  if (productId === undefined) {
    return undefined;
  }
  const product = PRODUCTS.find((p) => p.pid === productId);
  if (!product) {
    return undefined;
  }

  let merged: RawProductFeatures = { ...(product.features ?? {}) };
  for (const upgrade of product.upgrades ?? []) {
    if (isVersionAtLeast(upgrade, firmware) && upgrade.features) {
      merged = { ...merged, ...upgrade.features };
    }
  }

  return {
    productId,
    vendorName: VENDOR_NAME,
    productName: product.name,
    features: toFeatures(merged),
  };
}
