import { useMemo, useRef } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

import type { ParsedMovement } from '@/services/mercantil';

interface Props {
  /** Bytes del PDF en base64 (sin el prefijo data:). null = parser inactivo. */
  base64: string | null;
  onResult: (movs: ParsedMovement[]) => void;
  onError: (message: string) => void;
}

// Loader de pdf.js + parser que detecta automáticamente el layout del PDF:
//  - "estado de cuenta" (mes completo, dos columnas, FECHA/DESCRIPCION/NUMERO/CARGOS/ABONOS)
//  - "detalle de cuenta" (una columna, Fecha/Referencia/Descripción/Monto con signo)
// Ambos producen el mismo shape ParsedMovement.
const HTML = `<!doctype html><html><head><meta charset="utf-8" /></head><body>
<script type="module">
  import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

  const post = (msg) => window.ReactNativeWebView.postMessage(JSON.stringify(msg));

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  // "172.966,68" -> 172966.68 ; "-30,51" -> -30.51 ; "" -> 0
  function parseAmount(s) {
    if (!s) return 0;
    const clean = s.trim();
    if (!clean || clean === '-') return 0;
    const n = parseFloat(clean.replace(/\\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }

  function isDateShort(s) { return /^\\d{2}\\/\\d{2}$/.test(s.trim()); }
  function isDateFull(s) { return /^\\d{2}\\/\\d{2}\\/\\d{4}$/.test(s.trim()); }
  function isRefLong(s) { return /^\\d{5,}$/.test(s.trim()); }
  function isRefDetalle(s) { return /^\\d{12,}$/.test(s.trim()); }
  function isAmountLike(s) { return /^-?[\\d.]+,\\d{2}$/.test(s.trim()); }

  function groupLines(items) {
    const lines = [];
    for (const it of items) {
      const line = lines.find((L) => Math.abs(L.y - it.y) < 2);
      if (line) line.items.push(it);
      else lines.push({ y: it.y, items: [it] });
    }
    lines.sort((a, b) => b.y - a.y);
    for (const L of lines) L.items.sort((a, b) => a.x - b.x);
    return lines;
  }

  // "01-08-26" | "31-08-26" -> año 2026 (formato estado de cuenta)
  function extractYearEstado(items) {
    for (const it of items) {
      const m = /(\\d{2})-(\\d{2})-(\\d{2})/.exec(it.str);
      if (m) return 2000 + parseInt(m[3], 10);
    }
    return new Date().getFullYear();
  }

  function classify(pageItems) {
    // Detalle si aparece un encabezado "Referencia" y "Monto" sin "CARGOS"/"ABONOS".
    const uppers = pageItems.map((i) => i.str.trim().toUpperCase());
    const hasCargosAbonos = uppers.includes('CARGOS') && uppers.includes('ABONOS');
    if (hasCargosAbonos) return 'estado';
    const hasRefMonto =
      uppers.some((s) => s === 'REFERENCIA') &&
      uppers.some((s) => s.startsWith('MONTO'));
    if (hasRefMonto) return 'detalle';
    return 'unknown';
  }

  function parseEstadoPage(pageItems, viewportWidth, year) {
    const movements = [];
    const mid = viewportWidth / 2;
    const colL = pageItems.filter((it) => it.x < mid);
    const colR = pageItems.filter((it) => it.x >= mid);

    for (const col of [colL, colR]) {
      const lines = groupLines(col);
      let colX = null;
      for (const L of lines) {
        const strs = L.items.map((i) => i.str.trim().toUpperCase());
        if (
          strs.includes('FECHA') &&
          strs.includes('DESCRIPCION') &&
          strs.includes('CARGOS') &&
          strs.includes('ABONOS')
        ) {
          colX = {
            cargos: L.items.find((i) => i.str.trim().toUpperCase() === 'CARGOS')?.x ?? 0,
            abonos: L.items.find((i) => i.str.trim().toUpperCase() === 'ABONOS')?.x ?? 0,
          };
          break;
        }
      }
      if (!colX) continue;

      let current = null;
      const push = () => {
        if (!current) return;
        const [day, month] = current.date.split('/');
        movements.push({
          date: year + '-' + month + '-' + day,
          ref: current.ref,
          description: current.desc.replace(/\\s+/g, ' ').trim(),
          cargos: current.cargos,
          abonos: current.abonos,
        });
        current = null;
      };

      for (const L of lines) {
        const first = L.items[0];
        const second = L.items[1];
        const near = (it, target) =>
          Math.abs(it.x + (it.w || 0) - (target + 50)) < 60 || Math.abs(it.x - target) < 60;
        if (first && isDateShort(first.str) && second && isRefLong(second.str)) {
          push();
          current = { date: first.str.trim(), ref: second.str.trim(), desc: '', cargos: 0, abonos: 0 };
          for (let i = 2; i < L.items.length; i++) {
            const it = L.items[i];
            const s = it.str.trim();
            if (!s) continue;
            if (/^[\\d.,]+$/.test(s) && s.includes(',')) {
              if (near(it, colX.cargos)) current.cargos = parseAmount(s);
              else if (near(it, colX.abonos)) current.abonos = parseAmount(s);
            } else {
              current.desc += ' ' + s;
            }
          }
        } else if (current) {
          for (const it of L.items) {
            const s = it.str.trim();
            if (!s) continue;
            if (/^[\\d.,]+$/.test(s) && s.includes(',')) {
              if (near(it, colX.cargos) && current.cargos === 0) current.cargos = parseAmount(s);
              else if (near(it, colX.abonos) && current.abonos === 0) current.abonos = parseAmount(s);
            } else {
              current.desc += ' ' + s;
            }
          }
        }
      }
      push();
    }
    return movements;
  }

  function parseDetallePage(pageItems) {
    const movements = [];
    const lines = groupLines(pageItems);

    // Encontrar la línea del header para saber la X del "Monto"
    let montoX = null;
    for (const L of lines) {
      const strs = L.items.map((i) => i.str.trim().toUpperCase());
      const monto = L.items.find((i) => i.str.trim().toUpperCase().startsWith('MONTO'));
      if (
        strs.includes('FECHA') &&
        strs.some((s) => s === 'REFERENCIA') &&
        monto
      ) {
        montoX = monto.x;
        break;
      }
    }

    for (const L of lines) {
      // Buscar fecha DD/MM/YYYY y ref larga como firma de una fila válida
      const dateItem = L.items.find((it) => isDateFull(it.str));
      const refItem = L.items.find((it) => isRefDetalle(it.str));
      if (!dateItem || !refItem) continue;
      // Ignorar filas donde la ref es puros ceros (Saldo Final) o desc "Saldo Final"
      if (/^0+$/.test(refItem.str.trim())) continue;

      // Amount: el número con formato "-1.234,56" más a la derecha (o cerca de montoX)
      let amountItem = null;
      for (const it of L.items) {
        const s = it.str.trim();
        if (isAmountLike(s)) {
          if (!amountItem || it.x > amountItem.x) amountItem = it;
        }
      }
      if (!amountItem) continue;

      // Descripción: items entre la ref y el amount, ordenados por X
      const descItems = L.items.filter(
        (it) => it !== dateItem && it !== refItem && it !== amountItem && it.str.trim(),
      );
      // Filtrar textos que sean sólo signo/monto o que sean nombres de columna
      const desc = descItems
        .map((it) => it.str.trim())
        .filter((s) => !isAmountLike(s) && s.toUpperCase() !== 'MONTO (BS)')
        .join(' ')
        .replace(/\\s+/g, ' ')
        .trim();
      if (!desc || desc.toUpperCase() === 'SALDO FINAL') continue;

      const amount = parseAmount(amountItem.str);
      const [d, m, y] = dateItem.str.trim().split('/');
      movements.push({
        date: y + '-' + m + '-' + d,
        ref: refItem.str.trim(),
        description: desc,
        cargos: amount < 0 ? -amount : 0,
        abonos: amount > 0 ? amount : 0,
      });
    }
    return movements;
  }

  async function parseAll(base64) {
    const bytes = b64ToBytes(base64);
    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    const all = [];
    let yearEstado = new Date().getFullYear();
    let yearDetected = false;
    let layout = null;

    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items.map((it) => ({
        str: it.str,
        x: it.transform[4],
        y: it.transform[5],
        w: it.width || 0,
      }));

      if (!layout) {
        const c = classify(items);
        if (c !== 'unknown') layout = c;
      }

      if (layout === 'estado') {
        if (!yearDetected) {
          const y = extractYearEstado(items);
          if (y > 2000) { yearEstado = y; yearDetected = true; }
        }
        all.push(...parseEstadoPage(items, viewport.width, yearEstado));
      } else if (layout === 'detalle') {
        all.push(...parseDetallePage(items));
      } else {
        // Sin layout detectado en esta página: probar ambos y quedarnos con el que dé más
        const a = parseEstadoPage(items, viewport.width, yearEstado);
        const b = parseDetallePage(items);
        if (a.length >= b.length) all.push(...a); else all.push(...b);
      }
    }

    // Dedup por ref (por si dos páginas repiten)
    const byRef = new Map();
    for (const m of all) {
      if (!byRef.has(m.ref)) byRef.set(m.ref, m);
    }
    return [...byRef.values()];
  }

  window.addEventListener('message', async (ev) => {
    try {
      const { base64 } = JSON.parse(ev.data);
      const movs = await parseAll(base64);
      post({ ok: true, movements: movs });
    } catch (e) {
      post({ ok: false, error: (e && e.message) || String(e) });
    }
  });

  document.addEventListener('message', (ev) => window.dispatchEvent(new MessageEvent('message', { data: ev.data })));
  post({ ready: true });
</script>
</body></html>`;

export function PdfStatementParser({ base64, onResult, onError }: Props) {
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
            if (msg.ready) {
              readyRef.current = true;
              sendIfReady();
              return;
            }
            if (msg.ok) onResult(msg.movements as ParsedMovement[]);
            else onError(msg.error ?? 'Error desconocido al leer el PDF');
          } catch (err: any) {
            onError(err?.message ?? String(err));
          }
        }}
      />
    </View>
  );
}
