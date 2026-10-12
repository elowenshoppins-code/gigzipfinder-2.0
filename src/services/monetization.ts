/**
 * Monetización: compras simuladas (MOCK).
 *
 * El acceso se guarda en settings (SQLite) para que persista.
 * TODO: conectar RevenueCat / expo-in-app-purchases con los productos
 * reales antes de publicar en tiendas.
 */

import { useCallback, useEffect, useState } from 'react';
import { getSetting, setSetting } from '../db/database';

export const ZIP_PRICE = 20; // USD, pago único por app de gig
export const TOOLKIT_PRICE = 10; // USD/mes, suscripción al toolkit completo

const ZIP_KEY = (app: string) => `zip_access_${app}`;
const TOOLKIT_KEY = 'toolkit_sub';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** ¿El usuario compró el módulo de códigos ZIP para esta app? */
export async function hasZipAccess(app: string): Promise<boolean> {
  const v = await getSetting(ZIP_KEY(app));
  return v === '1';
}

/**
 * Compra simulada del módulo ZIP ($20 pago único).
 * TODO: reemplazar el delay por el flujo real de RevenueCat /
 * expo-in-app-purchases con el producto configurado en App Store / Play.
 */
export async function purchaseZip(app: string): Promise<void> {
  await delay(800); // MOCK: latencia de compra simulada
  await setSetting(ZIP_KEY(app), '1');
}

/** ¿El usuario tiene la suscripción activa del toolkit ($10/mes)? */
export async function hasToolkitAccess(): Promise<boolean> {
  const v = await getSetting(TOOLKIT_KEY);
  return v === 'active';
}

/**
 * Suscripción simulada al toolkit ($10/mes).
 * TODO: reemplazar por RevenueCat con el entitlement real.
 */
export async function subscribeToolkit(): Promise<void> {
  // TODO: RevenueCat — purchase del entitlement del toolkit
  await setSetting(TOOLKIT_KEY, 'active');
}

/**
 * Restaurar compras (MOCK).
 * TODO: RevenueCat — restorePurchases y sincronizar settings.
 */
export async function restorePurchases(): Promise<void> {
  // MOCK: no hace nada
}

/**
 * Hook: acceso al toolkit. Devuelve [acceso, refrescar].
 */
export function useToolkitAccess(): [boolean, () => void] {
  const [access, setAccess] = useState(false);

  const refresh = useCallback(() => {
    hasToolkitAccess()
      .then(setAccess)
      .catch((err) => {
        console.warn('[monetization] useToolkitAccess falló:', err);
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return [access, refresh];
}

/**
 * Hook: acceso al módulo ZIP de una app. Devuelve [acceso, refrescar].
 */
export function useZipAccess(app: string): [boolean, () => void] {
  const [access, setAccess] = useState(false);

  const refresh = useCallback(() => {
    hasZipAccess(app)
      .then(setAccess)
      .catch((err) => {
        console.warn('[monetization] useZipAccess falló:', err);
      });
  }, [app]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return [access, refresh];
}
