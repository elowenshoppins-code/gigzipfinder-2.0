/**
 * Monetización — fachada pública de compras.
 *
 * Delega en el `activeProvider` de `./billing` (hoy: simulado;
 * producción: RevenueCat). La API no cambia al cambiar de provider,
 * así que las pantallas no necesitan modificarse.
 */

import { useCallback, useEffect, useState } from 'react';
import { activeProvider } from './billing';

export const ZIP_PRICE = 20; // USD, pago único por app de gig
export const TOOLKIT_PRICE = 10; // USD/mes, suscripción al toolkit completo

/** ¿El usuario compró el módulo de códigos ZIP para esta app? */
export async function hasZipAccess(app: string): Promise<boolean> {
  return activeProvider.hasZipAccess(app);
}

/** Compra del módulo ZIP ($20 pago único). */
export async function purchaseZip(app: string): Promise<void> {
  return activeProvider.purchaseZip(app);
}

/** ¿El usuario tiene la suscripción activa del toolkit ($10/mes)? */
export async function hasToolkitAccess(): Promise<boolean> {
  return activeProvider.hasToolkitAccess();
}

/** Suscripción al toolkit ($10/mes). */
export async function subscribeToolkit(): Promise<void> {
  return activeProvider.subscribeToolkit();
}

/** Restaurar compras previas. */
export async function restorePurchases(): Promise<void> {
  return activeProvider.restorePurchases();
}

/** Hook: acceso al toolkit. Devuelve [acceso, refrescar]. */
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

/** Hook: acceso al módulo ZIP de una app. Devuelve [acceso, refrescar]. */
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
