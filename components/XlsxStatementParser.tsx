import { useMemo, useRef } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

import type { ParsedMovement } from '@/services/mercantil';

interface Props {
  /** Bytes del XLSX en base64 (sin el prefijo data:). null = parser inactivo. */
  base64: string | null;
  onResult: (movs: ParsedMovement[]) => void;
  onError: (message: string) => void;
}

// SheetJS en WebView oculto. Lee el "Detalle de cuenta" de Mercantil en XLSX:
// columnas: Tipo (NC/ND) | Fecha (DD/MM/YYYY) | Referencia | Descripción | Monto Bs.
// El signo del Monto indica cargo/abono. Salta la fila SALDO FINAL.
const HTML = `<!doctype html><html><head><meta charset="utf-8" /></head><body>
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<script>
  const post = (msg) => window.ReactNativeWebView.postMessage(JSON.stringify(msg));

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function toISO(dmy) {
    // "DD/MM/YYYY" -> "YYYY-MM-DD"
    const m = /^(\\d{2})\\/(\\d{2})\\/(\\d{4})$/.exec(String(dmy).trim());
    if (!m) return null;
    return m[3] + '-' + m[2] + '-' + m[1];
  }

  function toNumber(v) {
    if (typeof v === 'number' && isFinite(v)) return v;
    const s = String(v ?? '').trim();
    if (!s) return NaN;
    // Excel a veces mete formato "-1.234,56" (VES) o "-1234.56" (US). Detectamos.
    const hasComma = s.includes(',');
    const hasDot = s.includes('.');
    let clean = s;
    if (hasComma && hasDot) {
      // Asumimos formato VES: puntos = miles, coma = decimal
      clean = s.replace(/\\./g, '').replace(',', '.');
    } else if (hasComma) {
      clean = s.replace(',', '.');
    }
    const n = parseFloat(clean);
    return isFinite(n) ? n : NaN;
  }

  function findHeaderRow(aoa) {
    for (let i = 0; i < aoa.length; i++) {
      const row = aoa[i] || [];
      const norm = row.map((c) => String(c ?? '').trim().toUpperCase());
      const hasFecha = norm.includes('FECHA');
      const hasRef = norm.some((s) => s === 'REFERENCIA');
      const hasMonto = norm.some((s) => s.startsWith('MONTO'));
      if (hasFecha && hasRef && hasMonto) {
        return { idx: i, cols: norm };
      }
    }
    return null;
  }

  function colIndex(cols, matcher) {
    for (let i = 0; i < cols.length; i++) if (matcher(cols[i])) return i;
    return -1;
  }

  function log(msg) { post({ type: 'log', msg: String(msg) }); }

  function parseAll(base64) {
    log('xlsx bytes b64 len=' + base64.length);
    const bytes = b64ToBytes(base64);
    log('xlsx decoded bytes=' + bytes.length);
    if (typeof XLSX === 'undefined') { log('XLSX undefined - CDN no cargó'); return []; }
    const wb = XLSX.read(bytes, { type: 'array' });
    log('sheets=' + JSON.stringify(wb.SheetNames));
    const movements = [];
    for (const name of wb.SheetNames) {
      const sheet = wb.Sheets[name];
      const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
      log('sheet=' + name + ' rows=' + aoa.length);
      const header = findHeaderRow(aoa);
      if (!header) { log('no header row en ' + name); continue; }
      log('header row idx=' + header.idx + ' cols=' + JSON.stringify(header.cols));
      const cols = header.cols;
      const iFecha = colIndex(cols, (s) => s === 'FECHA');
      const iRef = colIndex(cols, (s) => s === 'REFERENCIA');
      const iDesc = colIndex(cols, (s) => s.startsWith('DESCRIP'));
      const iMonto = colIndex(cols, (s) => s.startsWith('MONTO'));
      const iTipo = colIndex(cols, (s) => s === 'TIPO');
      if (iFecha < 0 || iRef < 0 || iDesc < 0 || iMonto < 0) continue;

      for (let r = header.idx + 1; r < aoa.length; r++) {
        const row = aoa[r] || [];
        const fecha = row[iFecha];
        const ref = String(row[iRef] ?? '').trim();
        const desc = String(row[iDesc] ?? '').trim();
        const monto = toNumber(row[iMonto]);
        const tipo = iTipo >= 0 ? String(row[iTipo] ?? '').trim().toUpperCase() : '';

        const iso = toISO(fecha);
        if (!iso || !ref || !isFinite(monto)) continue;
        if (/^0+$/.test(ref)) continue;
        if (desc.toUpperCase() === 'SALDO FINAL') continue;

        // Signo: preferimos el signo del número; si viene sin signo usamos Tipo.
        let signed = monto;
        if (signed === 0) continue;
        if (signed > 0 && tipo === 'ND') signed = -signed;
        if (signed < 0 && tipo === 'NC') signed = -signed;

        movements.push({
          date: iso,
          ref,
          description: desc.replace(/\\s+/g, ' ').trim(),
          cargos: signed < 0 ? -signed : 0,
          abonos: signed > 0 ? signed : 0,
        });
      }
    }
    log('parsed movements=' + movements.length);
    // Dedup por ref
    const byRef = new Map();
    for (const m of movements) if (!byRef.has(m.ref)) byRef.set(m.ref, m);
    log('deduped=' + byRef.size);
    return [...byRef.values()];
  }

  window.addEventListener('message', (ev) => {
    try {
      const { base64 } = JSON.parse(ev.data);
      const movs = parseAll(base64);
      post({ ok: true, movements: movs });
    } catch (e) {
      post({ ok: false, error: (e && e.message) || String(e) });
    }
  });

  document.addEventListener('message', (ev) => window.dispatchEvent(new MessageEvent('message', { data: ev.data })));
  post({ ready: true });
</script>
</body></html>`;

export function XlsxStatementParser({ base64, onResult, onError }: Props) {
  const webRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const pendingRef = useRef<string | null>(null);

  const source = useMemo(() => ({ html: HTML, baseUrl: 'https://cdnjs.cloudflare.com' }), []);

  const sendIfReady = () => {
    if (readyRef.current && pendingRef.current != null && webRef.current) {
      const b = pendingRef.current;
      pendingRef.current = null;
      webRef.current.postMessage(JSON.stringify({ base64: b }));
    }
  };

  if (base64 && pendingRef.current !== base64) {
    pendingRef.current = base64;
    sendIfReady();
  }

  return (
    <View style={{ width: 0, height: 0, opacity: 0, position: 'absolute' }} pointerEvents="none">
      <WebView
        ref={webRef}
        source={source}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        onMessage={(e) => {
          try {
            const msg = JSON.parse(e.nativeEvent.data);
            if (msg.type === 'log') {
              console.log('[XLSX]', msg.msg);
              return;
            }
            if (msg.ready) {
              console.log('[XLSX] webview ready');
              readyRef.current = true;
              sendIfReady();
              return;
            }
            if (msg.ok) {
              console.log('[XLSX] onResult movements=', msg.movements?.length);
              onResult(msg.movements as ParsedMovement[]);
            } else {
              console.log('[XLSX] error:', msg.error);
              onError(msg.error ?? 'Error desconocido al leer el XLSX');
            }
          } catch (err: any) {
            console.log('[XLSX] onMessage exception', err?.message);
            onError(err?.message ?? String(err));
          }
        }}
      />
    </View>
  );
}
