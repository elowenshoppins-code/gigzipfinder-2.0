/**
 * REFERENCIA — implementación real de RevenueCat.
 *
 * Este archivo NO se empaqueta (nadie lo importa). Es la guía para
 * activar compras reales:
 *
 *   1. `npx expo install react-native-purchases`
 *   2. Copia el `revenueCatProvider` de abajo a `billing.ts`,
 *      reemplazando el stub.
 *   3. Pon tus API keys en REVENUECAT_KEYS.
 *   4. Cambia `activeProvider` a `revenueCatProvider`.
 *
 * Requiere: react-native-purchases instalado.
 */

/* eslint-disable */
// @ts-nocheck — archivo de referencia, no se compila en el bundle.

import { Platform } from 'react-native';
import { getSetting, setSetting } from '../db/database';
import {
  REVENUECAT_KEYS,
  ENTITLEMENTS,
  PRODUCTS,
  type BillingProvider,
} from './billing';

const ZIP_KEY = (app: string) => `zip_access_${app}`;
const TOOLKIT_KEY = 'toolkit_sub';

function revenueCatKey(): string {
  const key = Platform.OS === 'ios' ? REVENUECAT_KEYS.ios : REVENUECAT_KEYS.android;
  if (!key) {
    throw new Error(
      '[billing] RevenueCat sin configurar: pon tu API key en REVENUECAT_KEYS (src/services/billing.ts).',
    );
  }
  return key;
}

let rcConfigured = false;
function ensureRc(): any {
  const mod = require('react-native-purchases');
  const Purchases = mod.default ?? mod;
  if (!rcConfigured) {
    Purchases.configure({ apiKey: revenueCatKey() });
    rcConfigured = true;
  }
  return Purchases;
}

export const revenueCatProvider: BillingProvider = {
  id: 'revenuecat',
  get isConfigured(): boolean {
    return REVENUECAT_KEYS.ios !== '' || REVENUECAT_KEYS.android !== '';
  },

  async hasZipAccess(app: string): Promise<boolean> {
    try {
      const info = await ensureRc().getCustomerInfo();
      return Boolean(
        info.entitlements.active[`${ENTITLEMENTS.zip}:${app}`] ??
          info.entitlements.active[ENTITLEMENTS.zip],
      );
    } catch {
      return false;
    }
  },

  async purchaseZip(app: string): Promise<void> {
    const Purchases = ensureRc();
    await Purchases.purchaseProduct(PRODUCTS.zipPerApp(app));
    await setSetting(ZIP_KEY(app), '1'); // caché local
  },

  async hasToolkitAccess(): Promise<boolean> {
    try {
      const info = await ensureRc().getCustomerInfo();
      return Boolean(info.entitlements.active[ENTITLEMENTS.toolkit]);
    } catch {
      return (await getSetting(TOOLKIT_KEY)) === 'active'; // fallback a caché
    }
  },

  async subscribeToolkit(): Promise<void> {
    const Purchases = ensureRc();
    const offerings = await Purchases.getOfferings();
    const monthly = offerings.current?.monthly;
    if (!monthly) {
      await Purchases.purchaseProduct(PRODUCTS.toolkitMonthly);
    } else {
      await Purchases.purchaseStoreProduct(monthly.product);
    }
    await setSetting(TOOLKIT_KEY, 'active'); // caché local
  },

  async restorePurchases(): Promise<void> {
    const Purchases = ensureRc();
    const info = await Purchases.restorePurchases();
    const active =
      info?.entitlements?.active ??
      (await Purchases.getCustomerInfo()).entitlements.active;
    await setSetting(TOOLKIT_KEY, active[ENTITLEMENTS.toolkit] ? 'active' : '');
  },
};
