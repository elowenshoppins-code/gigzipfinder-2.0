/**
 * Billing — adaptador de compras listo para producción.
 *
 * Arquitectura: la app habla contra la interfaz `BillingProvider`.
 * Hoy el provider activo es `MockBillingProvider` (compras simuladas
 * guardadas en settings). Para activar compras reales:
 *
 *   1. Crea los productos en App Store Connect y Google Play Console:
 *      - ZIP por app: producto NO renovable de $20 USD (uno por app de gig,
 *        o un solo producto y registra la app en tu backend).
 *      - Toolkit: suscripción auto-renovable de $10 USD/mes.
 *   2. Crea la cuenta en RevenueCat (https://www.revenuecat.com) y
 *      configura los entitlements:
 *        - `zip_access`  → productos de $20
 *        - `toolkit_pro` → suscripción de $10/mes
 *   3. Pon tus API keys abajo en REVENUECAT_KEYS.
 *   4. `npx expo install react-native-purchases`
 *   5. Cambia `activeProvider` a `revenueCatProvider`.
 *
 * Sin keys configuradas, el RevenueCatProvider lanza un error claro en
 * lugar de cobrar de mentiras: nunca se simula un cobro real.
 */

import { Platform } from 'react-native';
import { getSetting, setSetting } from '../db/database';

/* ------------------------------------------------------------------ */
/* Configuración — Carlos: pon aquí tus keys de RevenueCat             */
/* ------------------------------------------------------------------ */

const REVENUECAT_KEYS: { ios: string; android: string } = {
  ios: '', // p. ej. 'appl_XXXXXXXXXXXXXXXX'
  android: '', // p. ej. 'goog_XXXXXXXXXXXXXXXX'
};

/** IDs de entitlement en RevenueCat (deben coincidir con tu dashboard). */
export const ENTITLEMENTS = {
  zip: 'zip_access',
  toolkit: 'toolkit_pro',
} as const;

/** IDs de producto en las tiendas (referencia; RevenueCat los mapea). */
export const PRODUCTS = {
  /** $20 USD pago único por app de gig. */
  zipPerApp: (app: string) => `gigzipfinder.zip.${app}.onetime`,
  /** $10 USD/mes suscripción al toolkit. */
  toolkitMonthly: 'gigzipfinder.toolkit.monthly',
} as const;

/* ------------------------------------------------------------------ */
/* Interfaz del provider                                               */
/* ------------------------------------------------------------------ */

export interface BillingProvider {
  readonly id: 'mock' | 'revenuecat';
  /** ¿Tiene este provider credenciales reales configuradas? */
  readonly isConfigured: boolean;
  hasZipAccess(app: string): Promise<boolean>;
  purchaseZip(app: string): Promise<void>;
  hasToolkitAccess(): Promise<boolean>;
  subscribeToolkit(): Promise<void>;
  restorePurchases(): Promise<void>;
}

/* ------------------------------------------------------------------ */
/* Provider simulado (desarrollo / demos)                              */
/* ------------------------------------------------------------------ */

const ZIP_KEY = (app: string) => `zip_access_${app}`;
const TOOLKIT_KEY = 'toolkit_sub';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const mockBillingProvider: BillingProvider = {
  id: 'mock',
  isConfigured: false,

  async hasZipAccess(app: string): Promise<boolean> {
    return (await getSetting(ZIP_KEY(app))) === '1';
  },

  async purchaseZip(app: string): Promise<void> {
    await delay(800); // latencia simulada
    await setSetting(ZIP_KEY(app), '1');
  },

  async hasToolkitAccess(): Promise<boolean> {
    return (await getSetting(TOOLKIT_KEY)) === 'active';
  },

  async subscribeToolkit(): Promise<void> {
    await delay(800);
    await setSetting(TOOLKIT_KEY, 'active');
  },

  async restorePurchases(): Promise<void> {
    // Nada que restaurar en modo simulado.
  },
};

/* ------------------------------------------------------------------ */
/* Provider RevenueCat (producción)                                    */
/*                                                                     */
/* Carga `react-native-purchases` de forma diferida para que la app    */
/* compile y corra aunque el módulo nativo aún no esté instalado.      */
/* ------------------------------------------------------------------ */

type PurchasesModule = {
  configure(options: { apiKey: string }): void;
  purchaseProduct(productId: string): Promise<unknown>;
  purchaseStoreProduct(product: unknown): Promise<unknown>;
  getOfferings(): Promise<{
    current?: {
      monthly?: { product: { identifier: string } } | null;
    } | null;
  }>;
  restorePurchases(): Promise<unknown>;
  getCustomerInfo(): Promise<{
    entitlements: { active: Record<string, unknown> };
  }>;
};

function loadPurchases(): PurchasesModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('react-native-purchases');
  return (mod.default ?? mod) as PurchasesModule;
}

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
function ensureRc(): PurchasesModule {
  const Purchases = loadPurchases();
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
      return Boolean(info.entitlements.active[`${ENTITLEMENTS.zip}:${app}`] ?? info.entitlements.active[ENTITLEMENTS.zip]);
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
      // Sin offering configurado: compra directa del producto.
      await Purchases.purchaseProduct(PRODUCTS.toolkitMonthly);
    } else {
      await Purchases.purchaseStoreProduct(monthly.product);
    }
    await setSetting(TOOLKIT_KEY, 'active'); // caché local
  },

  async restorePurchases(): Promise<void> {
    const Purchases = ensureRc();
    const info = (await Purchases.restorePurchases()) as
      | { entitlements: { active: Record<string, unknown> } }
      | undefined;
    const active = info?.entitlements?.active ?? (await Purchases.getCustomerInfo()).entitlements.active;
    await setSetting(TOOLKIT_KEY, active[ENTITLEMENTS.toolkit] ? 'active' : '');
  },
};

/* ------------------------------------------------------------------ */
/* Provider activo — cambia a revenueCatProvider para producción       */
/* ------------------------------------------------------------------ */

/** TODO(Carlos): cambia a `revenueCatProvider` cuando configures tus keys. */
export const activeProvider: BillingProvider = mockBillingProvider;
