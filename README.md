# Gig ZipFinder 2.0

App móvil para conductores de gig (Instacart, DoorDash, Spark Driver y más) con 10 módulos:

1. **Zonas ZIP** — consulta de códigos ZIP con alta disponibilidad para registrarse en apps de gig (pago único $20 por app).
2. **Gig Miles** — registro automático de millas de trabajo con la app en segundo plano.
3. **Ganancias** — tracking de ingresos por app.
4. **Apelación AI** — asistente para redactar apelaciones de desactivaciones.
5. **Tax Center** — estimación de impuestos trimestrales *(estimación, no asesoría fiscal)*.
6. **Combustible** — registro de gasto de gasolina.
7. **Puntaje** — salud del conductor.
8. **Zonas calientes** — mapa de demanda.
9. **Bóveda** — documentos y recibos.
10. **Ajustes** — privacidad, datos demo, suscripción.

**Monetización:** módulo ZIP a $20 pago único por app; el resto del toolkit por suscripción de $10/mes.

## Requisitos

- Node.js 18 o superior
- App **Expo Go** (para probar en tu teléfono)
- iOS 13+ o Android 5+

## Instalación

```bash
cd gig-zipfinder-app
npx expo install
npm install
npx expo start
```

Escanea el código QR con Expo Go (Android) o con la cámara (iOS).

## Comandos

| Comando             | Qué hace                          |
| ------------------- | --------------------------------- |
| `npx expo start`    | Inicia el servidor de desarrollo   |
| `npm run android`   | Abre en Android                    |
| `npm run ios`       | Abre en iOS (requiere macOS)       |
| `npm run typecheck` | Chequea tipos con TypeScript       |

## Estructura del proyecto

```
gig-zipfinder-app/
├── app/                    # Rutas (expo-router v4)
│   ├── _layout.tsx         # Stack raíz: initDb() + seedIfNeeded()
│   ├── (tabs)/             # 5 pestañas: Inicio, Ganancias, Millas, Apelación, Gig AI
│   ├── taxes.tsx           # Tax Center
│   ├── zip.tsx             # Zonas ZIP
│   ├── multiapp.tsx        # Multi-app
│   ├── gas.tsx             # Combustible
│   ├── score.tsx           # Puntaje
│   ├── hotzones.tsx        # Zonas calientes
│   ├── vault.tsx           # Bóveda
│   └── settings.tsx        # Ajustes
├── src/
│   ├── i18n/               # Textos (es activo; en en TODO)
│   ├── components/         # Screen, StatCard, Paywall
│   ├── db/                 # SQLite (initDb) — contrato para otros módulos
│   ├── services/           # mileage (background task), monetization — contratos
│   └── seed.ts             # Datos demo (seedIfNeeded, wipeDemoData)
├── app.json                # Config Expo (permisos de ubicación en ES)
└── package.json
```

## Datos demo

Al arrancar, la app siembra datos de ejemplo (`seedIfNeeded()` en `src/seed.ts`) para
probar las pantallas sin backend. Puedes borrarlos desde **Ajustes → Borrar datos demo**.

## Permisos

- **Ubicación (siempre):** contar millas de trabajo, incluso con la app en segundo plano.
- **Movimiento:** detectar viajes automáticamente.
- **Cámara / biblioteca de fotos:** adjuntar recibos a los registros.
- **Notificaciones:** recordatorios de impuestos y alertas de zonas calientes.

Tus datos se quedan en tu dispositivo (SQLite local). No hay envío a servidores en esta versión.

## Monetización (pendiente)

El flujo de compra real aún no está conectado:

- ZIP: $20 pago único por app.
- Toolkit: $10/mes suscripción.
- **TODO:** integrar RevenueCat (`react-native-purchases`) para compra real, paywall (`Paywall.tsx` listo) y restaurar compras.

## EAS Build (iOS)

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform ios --profile production
```

## Pasos del dueño para subir al App Store

1. Tener una cuenta activa de **Apple Developer Program**.
2. Verificar el bundle ID **`com.gigzipfinder.app`** en el identificador de la app.
3. En **App Store Connect**: crear una nueva app o reutilizar el listing existente (**id6760034462**, «Gig zipfinder»).
4. Subir el build: `eas submit --platform ios` (o Transporter con el .ipa generado por EAS).
5. Preparar **screenshots** (6.7" y 6.5"), descripción, palabras clave y política de privacidad.
6. Enviar a revisión y esperar la aprobación de Apple.

## Qué NO está incluido

- **Compra real:** los botones de compra son placeholders; falta RevenueCat.
- **API de IA real:** el módulo Gig AI / Apelación no conecta a ningún modelo todavía.
- **API de sugerencias ZIP:** la disponibilidad de ZIPs usa datos locales/demo; no hay backend.
- **Traducción EN/PT:** la UI está en español; `src/i18n/en.ts` está pendiente de traducción.
