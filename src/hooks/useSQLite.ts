import { useEffect, useRef, useState, useCallback } from 'react';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';

let sqlPromise: Promise<SqlJsStatic> | null = null;

function getSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({
      // On sert le wasm depuis /public/sql-wasm.wasm
      locateFile: () => '/sql-wasm.wasm',
    });
  }
  return sqlPromise!;
}

export interface UseSQLiteResult {
  ready: boolean;
  error: string | null;
  query: <T = Record<string, any>>(sql: string, params?: any[]) => T[];
  run: (sql: string, params?: any[]) => void;
  /** Exporte le DB modifié en Uint8Array (pour sauvegarde) */
  exportDb: () => Uint8Array | null;
}

export function useSQLite(url: string): UseSQLiteResult {
  const dbRef = useRef<Database | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError(null);

    (async () => {
      try {
        const SQL = await getSql();
        const buf = await fetch(url).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status} fetching ${url}`);
          return r.arrayBuffer();
        });
        if (cancelled) return;
        dbRef.current = new SQL.Database(new Uint8Array(buf));
        setReady(true);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Erreur chargement SQLite');
      }
    })();

    return () => {
      cancelled = true;
      // Ne pas fermer le DB ici — StrictMode double-mount le démonterait trop tôt
    };
  }, [url]);

  const query = useCallback(<T = Record<string, any>>(sql: string, params: any[] = []): T[] => {
    if (!dbRef.current) return [];
    try {
      const stmt = dbRef.current.prepare(sql);
      stmt.bind(params);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      stmt.free();
      return rows;
    } catch (e: any) {
      console.error('[useSQLite] query error:', e?.message, sql);
      return [];
    }
  }, []);

  const run = useCallback((sql: string, params: any[] = []) => {
    if (!dbRef.current) return;
    try {
      dbRef.current.run(sql, params);
    } catch (e: any) {
      console.error('[useSQLite] run error:', e?.message, sql);
    }
  }, []);

  const exportDb = useCallback((): Uint8Array | null => {
    if (!dbRef.current) return null;
    return dbRef.current.export();
  }, []);

  return { ready, error, query, run, exportDb };
}