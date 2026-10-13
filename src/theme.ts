/**
 * Identidad visual oficial de GIG ZipFinder (gigzipfinder.com).
 *
 * Fondo azul marino oscuro con acentos cian/lima, botones píldora
 * y tarjetas redondeadas. NO usar la paleta de bitezax (verde #00A651).
 */
export const theme = {
  /** Fondo principal de pantalla (azul marino) */
  bg: '#0A1628',
  /** Fondo más profundo (modales, zonas hundidas) */
  bgDeep: '#071120',
  /** Fondo de tarjetas e inputs */
  card: '#101F38',

  /** Cian: acciones principales, CTAs, estados activos */
  primary: '#22D3EE',
  /** Lima: acentos y estados de éxito */
  accent: '#4ADE80',
  /** Lima alternativo */
  accentAlt: '#A3E635',

  /** Titulares */
  text: '#FFFFFF',
  /** Cuerpo de texto */
  textBody: '#C9D6E8',
  /** Texto apagado / placeholders */
  textMuted: '#8FA3BF',

  /** Bordes sutiles sobre fondo oscuro */
  border: 'rgba(255,255,255,0.08)',

  /** Texto sobre botones primarios cian */
  onPrimary: '#0A1628',

  danger: '#F87171',
  warning: '#FBBF24',
  success: '#4ADE80',

  /** Fondos translúcidos para insignias y avisos */
  successBg: 'rgba(74,222,128,0.12)',
  warningBg: 'rgba(251,191,36,0.12)',
  dangerBg: 'rgba(248,113,113,0.12)',

  /** Sombra/overlay de modales */
  overlay: 'rgba(0,0,0,0.55)',

  /** Radios */
  radiusCard: 20,
  radiusPill: 999,
} as const;

export type Theme = typeof theme;
