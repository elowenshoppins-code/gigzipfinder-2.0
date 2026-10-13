/**
 * Billing — adaptador de compras listo para producción.
 *
 * Arquitectura: la app habla contra la interfaz `BillingProvider`.
 * Hoy el provider activo es `MockBillingProvider` (compras simuladas
 * guardadas en settings). Para activar compras reales con RevenueCat:
 *
 *   1. Crea los productos en App Store Connect y Google Play Console:
 *      - ZIP por app: producto NO renovable de $20 USD.
 *      - Toolkit: suscripción auto-renovable de $10 USD/mes.
 *   2. Crea tu cuenta en RevenueCat y configura los entitlements:
 *        - `zip_access`  → productos de $20
 *        - `toolkit_pro` → suscripción de $10/mes
 *   3. Ejecuta: `npx expo install react-native-purchases`
 *   4. Pon tus API keys en REVENUECAT_KEYS (abajo).
 *   5. Reemplaza el cuerpo de `revenueCatProvider` con la implementación
 *      de referencia en `billing.revenuecat.reference.ts`.
 *   6. Cambia `activeProvider` a `revenueCatProvider`.
 *
 * El SDK de RevenueCat NO está instalado a propósito: es un módulo
 * nativo y solo debe agregarse cuando vayas a usar compras reales.
 */

import { getSetting, setSetting } from '../db/database';

/* ------------------------------------------------------------------ */
/* Configuración — Carlos: pon aquí tus keys de RevenueCat             */
/* ------------------------------------------------------------------ */

export const REVENUECAT_KEYS: { ios: string; android: string } = {
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

function notConfigured(): never {
  throw new Error(
    '[billing] RevenueCat no está configurado. Sigue los pasos en src/services/billing.ts ' +
      '(instala react-native-purchases, pon tus API keys y activa revenueCatProvider).',
  );
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
/* Implementación real en `billing.revenuecat.reference.ts` (código    */
/* de referencia, no se empaqueta). Actívalo siguiendo los pasos      */
/* del encabezado de este archivo.                                     */
/* ------------------------------------------------------------------ */

export const revenueCatProvider: BillingProvider = {
  id: 'revenuecat',
  get isConfigured(): boolean {
    return REVENUECAT_KEYS.ios !== '' || REVENUECAT_KEYS.android !== '';
  },

  hasZipAccess: async () => notConfigured(),
  purchaseZip: async () => notConfigured(),
  hasToolkitAccess: async () => notConfigured(),
  subscribeToolkit: async () => notConfigured(),
  restorePurchases: async () => notConfigured(),
};

/* ------------------------------------------------------------------ */
/* Provider activo — cambia a revenueCatProvider para producción       */
/* ------------------------------------------------------------------ */

/** TODO(Carlos): cambia a `revenueCatProvider` cuando configures tus keys. */
export const activeProvider: BillingProvider = mockBillingProvider;
