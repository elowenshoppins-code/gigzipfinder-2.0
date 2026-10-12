/**
 * Capa de datos local — SQLite (expo-sqlite).
 *
 * Toda la persistencia de Gig ZipFinder 2.0 vive aquí: viajes (Gig Miles),
 * ganancias (Earnings), cargas de gasolina, documentos, apelaciones AI,
 * códigos ZIP, mantenimiento del vehículo y ajustes (settings).
 *
 * Contrato: otros módulos importan getDb, initDb, getSetting, setSetting
 * y las interfaces TypeScript desde este archivo.
 */

import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

/**
 * Devuelve la instancia SQLite abierta (la abre si aún no existe).
 *
 * IMPORTANTE: no llama a initDb (lo haría recursivo: initDb usa getDb).
 * Llama a initDb() una vez al arranque de la app (ver seed.ts / App.tsx).
 */
export function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync('gigzipfinder.db');
  }
  return db;
}

/** Crea todas las tablas de la app si no existen. Idempotente. */
export async function initDb(): Promise<void> {
  const database = getDb();
  try {
    database.execSync(`
      CREATE TABLE IF NOT EXISTS trips (
        id TEXT PRIMARY KEY,
        startTime INTEGER,
        endTime INTEGER,
        distanceMiles REAL,
        purpose TEXT,
        platform TEXT,
        notes TEXT,
        isDemo INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS earnings (
        id TEXT PRIMARY KEY,
        date TEXT,
        platform TEXT,
        zone TEXT,
        earnings REAL,
        tips REAL,
        miles REAL,
        hours REAL,
        waitMinutes REAL DEFAULT 0,
        gas REAL,
        tolls REAL,
        parking REAL,
        isDemo INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS fuelups (
        id TEXT PRIMARY KEY,
        date INTEGER,
        amount REAL,
        gallons REAL,
        odometerMiles REAL,
        isDemo INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        name TEXT,
        type TEXT,
        uri TEXT,
        expiryDate TEXT,
        isDemo INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS appeals (
        id TEXT PRIMARY KEY,
        platform TEXT,
        problem TEXT,
        answersJson TEXT,
        letterEs TEXT,
        letterEn TEXT,
        createdAt INTEGER
      );
      CREATE TABLE IF NOT EXISTS zipcodes (
        id TEXT PRIMARY KEY,
        code TEXT,
        app TEXT,
        notes TEXT
      );
      CREATE TABLE IF NOT EXISTS maintenance (
        id TEXT PRIMARY KEY,
        type TEXT,
        dueDate TEXT,
        done INTEGER DEFAULT 0,
        isDemo INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
  } catch (err) {
    console.warn('[database] initDb falló:', err);
  }
}

/** Lee un ajuste por clave. Devuelve null si no existe. */
export async function getSetting(key: string): Promise<string | null> {
  try {
    const row = getDb().getFirstSync<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      [key],
    );
    return row ? row.value : null;
  } catch (err) {
    console.warn('[database] getSetting falló:', err);
    return null;
  }
}

/** Guarda (inserta o reemplaza) un ajuste. */
export async function setSetting(key: string, value: string): Promise<void> {
  try {
    getDb().runSync(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      [key, value],
    );
  } catch (err) {
    console.warn('[database] setSetting falló:', err);
  }
}

/* ------------------------------------------------------------------ */
/* Interfaces TypeScript — contrato de la capa de datos                */
/* ------------------------------------------------------------------ */

/** Viaje rastreado (Gig Miles). */
export interface Trip {
  id: string;
  startTime: number; // epoch ms
  endTime: number | null; // epoch ms; null = en curso
  distanceMiles: number;
  purpose: 'work' | 'personal';
  platform: string | null; // 'doordash' | 'instacart' | 'spark' | ...
  notes: string | null;
  isDemo: number; // 0 | 1
}

/** Entrada diaria de ganancias (Earnings). */
export interface EarningEntry {
  id: string;
  date: string; // 'YYYY-MM-DD'
  platform: string;
  zone: string | null;
  earnings: number;
  tips: number;
  miles: number;
  hours: number;
  waitMinutes: number;
  gas: number;
  tolls: number;
  parking: number;
  isDemo: number; // 0 | 1
}

/** Carga de gasolina. */
export interface FuelUp {
  id: string;
  date: number; // epoch ms
  amount: number; // dólares
  gallons: number;
  odometerMiles: number;
  isDemo: number; // 0 | 1
}

/** Documento del conductor (seguro, licencia, registro...). */
export interface DocRecord {
  id: string;
  name: string;
  type: string;
  uri: string;
  expiryDate: string | null; // 'YYYY-MM-DD'
  isDemo: number; // 0 | 1
}

/** Apelación generada por Appeal AI. */
export interface AppealRecord {
  id: string;
  platform: string;
  problem: string;
  answersJson: string; // respuestas del cuestionario serializadas
  letterEs: string;
  letterEn: string;
  createdAt: number; // epoch ms
}

/** Código ZIP con alta disponibilidad (módulo $20 pago único). */
export interface ZipCode {
  id: string;
  code: string; // '32801'
  app: string; // 'instacart' | 'doordash' | 'spark' | ...
  notes: string | null;
}

/** Ítem de mantenimiento del vehículo. */
export interface MaintenanceItem {
  id: string;
  type: string; // 'cambio de aceite' | 'registro' | 'llantas' | ...
  dueDate: string; // 'YYYY-MM-DD'
  done: number; // 0 | 1
  isDemo: number; // 0 | 1
}
