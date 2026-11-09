import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Modal, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Card,
  Divider,
  HelperText,
  Snackbar,
  Text,
} from 'react-native-paper';
import type { WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';
import { WebView } from 'react-native-webview';

import { PdfStatementParser } from '@/components/PdfStatementParser';
import { XlsxStatementParser } from '@/components/XlsxStatementParser';
import { AppColors } from '@/constants/theme';
import {
  MERCANTIL_STATEMENTS_URL,
  MERCANTIL_URL,
  ParsedMovement,
  countMercantilMovements,
  hasProtectedMercantilCreds,
  importMovements,
  isMercantilUrl,
  unlockMercantilCreds,
} from '@/services/mercantil';

const DOWNLOAD_INTERCEPT_JS = `
(function() {
  if (window.__pdfHookInstalled) return;
  window.__pdfHookInstalled = true;

  const post = (m) => window.ReactNativeWebView.postMessage(JSON.stringify(m));

  async function capture(url, filename) {
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) { post({ type: 'download_error', message: 'HTTP ' + res.status }); return; }
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onload = () => {
        const b64 = String(reader.result).split(',')[1] || '';
        post({ type: 'pdf', filename: filename || 'estado.pdf', base64: b64 });
      };
      reader.onerror = () => post({ type: 'download_error', message: 'FileReader falló' });
      reader.readAsDataURL(blob);
    } catch (e) {
      post({ type: 'download_error', message: (e && e.message) || String(e) });
    }
  }

  const isPdfLike = (url) => {
    if (!url) return false;
    if (url.startsWith('blob:')) return true;
    const clean = url.split('?')[0].split('#')[0].toLowerCase();
    return clean.endsWith('.pdf');
  };

  document.addEventListener('click', function(ev) {
    let el = ev.target;
    while (el && el.tagName !== 'A') el = el.parentElement;
    if (!el) return;
    const href = el.href;
    if (isPdfLike(href) || el.hasAttribute('download')) {
      ev.preventDefault();
      ev.stopPropagation();
      capture(href, el.getAttribute('download'));
    }
  }, true);

  const origOpen = window.open;
  window.open = function(url, ...rest) {
    if (isPdfLike(url)) { capture(url); return null; }
    return origOpen.call(window, url, ...rest);
  };

  post({ type: 'hook_ready' });
})();
true;
`;

// Only follows the account-detail/download path; never interacts with payments.
const SYNC_JS = `
(function() {
  if (window.__mercantilSyncRunning) return;
  window.__mercantilSyncRunning = true;
  const post = (m) => window.ReactNativeWebView.postMessage(JSON.stringify(m));
  const findText = (selector, text) => Array.from(document.querySelectorAll(selector))
    .find((el) => el.textContent.trim() === text && el.getClientRects().length);
  let stage = location.pathname.includes('/summary') ? 0 : 2;
  let attempts = 0;
  const timer = setInterval(() => {
    try {
      let el = null;
      if (stage === 0) el = findText('.detail-section-card-options__value', 'Más opciones');
      if (stage === 1) el = findText('.panel-option__value', 'Ver detalle de cuenta');
      if (stage === 2) el = findText('.icon-button__text', 'Descargar');
      if (stage === 3) el = document.querySelector('img[alt="xlsIcon"]');
      if (el && el.getClientRects().length) {
        el.click();
        stage++;
        attempts = 0;
        if (stage === 4) {
          clearInterval(timer);
          window.__mercantilSyncRunning = false;
          post({ type: 'sync_download_requested' });
        }
      } else if (++attempts > 30) {
        clearInterval(timer);
        window.__mercantilSyncRunning = false;
        post({ type: 'sync_error', message: 'No encontré el siguiente botón. Revisa que estés en el resumen o detalle de tu cuenta.' });
      }
    } catch (e) {
      clearInterval(timer);
      window.__mercantilSyncRunning = false;
      post({ type: 'sync_error', message: (e && e.message) || String(e) });
    }
  }, 1000);
})(); true;
`;

export default function MercantilScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [hasCreds, setHasCreds] = useState(false);
  const [movementsCount, setMovementsCount] = useState<number>(0);
  const [refreshing, setRefreshing] = useState(false);

  const [webOpen, setWebOpen] = useState(false);
  const [webUrl, setWebUrl] = useState<string>(MERCANTIL_URL);
  const [webBusy, setWebBusy] = useState(false);
  const webRef = useRef<WebView<{}>>(null);

  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [xlsxBase64, setXlsxBase64] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);
  const currentUrl = useRef(MERCANTIL_URL);

  const loadState = useCallback(async () => {
    setHasCreds(await hasProtectedMercantilCreds());
    setMovementsCount(await countMercantilMovements());
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { void loadState(); }, [loadState]));

  const onBiometricLogin = async () => {
    try {
      const url = new URL(currentUrl.current);
      if (url.origin !== 'https://www30.mercantilbanco.com' || url.pathname !== '/login') {
        Alert.alert('Inicio de sesión', 'Abre primero la pantalla de inicio de sesión de Mercantil.');
        return;
      }
      const creds = await unlockMercantilCreds();
      if (!creds) {
        Alert.alert('Datos no disponibles', 'Guarda nuevamente tu usuario y clave en Ajustes.');
        return;
      }
      const payload = JSON.stringify(creds).replace(/</g, '\\u003c');
      webRef.current?.injectJavaScript(`(function() {
        if (location.origin !== 'https://www30.mercantilbanco.com' || location.pathname !== '/login') return;
        const data = ${payload};
        const pass = document.querySelector('input#password[type="password"]');
        const user = document.querySelector('input#username, input#user, input[name*="username"], input[name*="usuario"]');
        const set = (el, value) => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        };
        if (!pass) { window.ReactNativeWebView.postMessage(JSON.stringify({type:'login_error'})); return; }
        if (user) set(user, data.username);
        set(pass, data.password);
        window.ReactNativeWebView.postMessage(JSON.stringify({type:'login_filled'}));
      })(); true;`);
    } catch {
      Alert.alert('No se pudo desbloquear', 'Comprueba tu huella o vuelve a guardar tus datos en Ajustes.');
    }
  };

  const onOpenBankWeb = () => {
    setWebUrl(MERCANTIL_URL);
    setWebOpen(true);
  };

  const onWebMessage = async (ev: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(ev.nativeEvent.data);
      if (msg.type === 'pdf') {
        setWebBusy(true);
        if (typeof msg.base64 === 'string' && (msg.base64.startsWith('UEsDB') || msg.base64.startsWith('0M8R4'))) {
          setXlsxBase64(msg.base64);
        } else {
          setPdfBase64(msg.base64);
        }
      } else if (msg.type === 'sync_download_requested') {
        setSnack('Descarga solicitada; esperando el archivo...');
      } else if (msg.type === 'login_filled') {
        setSnack('Datos completados. Pulsa Iniciar en el banco.');
      } else if (msg.type === 'login_error') {
        Alert.alert('Inicio de sesión', 'No encontré los campos de acceso del banco.');
      } else if (msg.type === 'download_error' || msg.type === 'sync_error') {
        setWebBusy(false);
        Alert.alert('No se pudo sincronizar', msg.message ?? '');
      }
    } catch {
      // ignoramos
    }
  };

  const onWebNav = (nav: WebViewNavigation) => {
    currentUrl.current = nav.url;
    if (!isMercantilUrl(nav.url)) {
      webRef.current?.stopLoading();
      webRef.current?.goBack();
      Alert.alert('Bloqueado', 'La app solo permite navegar dentro de mercantilbanco.com.');
    }
  };

  const onShouldStart = (nav: any) => isMercantilUrl(nav.url);

  const goToStatements = () => {
    setWebUrl(MERCANTIL_STATEMENTS_URL);
    webRef.current?.injectJavaScript(
      `window.location.href = ${JSON.stringify(MERCANTIL_STATEMENTS_URL)}; true;`,
    );
  };

  const onPickPdf = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
      ],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled || !res.assets?.length) return;
    const asset = res.assets[0];
    const name = (asset.name ?? asset.uri).toLowerCase();
    const mime = (asset.mimeType ?? '').toLowerCase();
    const isXlsx =
      name.endsWith('.xlsx') ||
      name.endsWith('.xls') ||
      mime.includes('spreadsheetml') ||
      mime.includes('ms-excel');
    console.log('[Mercantil] picked file', { name, mime, uri: asset.uri, isXlsx });
    try {
      const file = new File(asset.uri);
      const base64 = await file.base64();
      console.log('[Mercantil] base64 len=', base64.length, 'routing to', isXlsx ? 'XLSX' : 'PDF');
      setImporting(true);
      if (isXlsx) setXlsxBase64(base64);
      else setPdfBase64(base64);
    } catch (e: any) {
      console.log('[Mercantil] read error', e?.message);
      Alert.alert('Error leyendo el archivo', e?.message ?? String(e));
    }
  };

  const onParseResult = async (movs: ParsedMovement[]) => {
    console.log('[Mercantil] parse result count=', movs.length);
    setPdfBase64(null);
    setXlsxBase64(null);
    if (movs.length === 0) {
      setImporting(false);
      setWebBusy(false);
      Alert.alert(
        'Sin movimientos',
        'No pude leer movimientos del archivo. ¿Estás seguro que es un estado o detalle de cuenta de Mercantil?',
      );
      return;
    }
    try {
      const summary = await importMovements(movs);
      setMovementsCount(await countMercantilMovements());
      setImporting(false);
      setWebBusy(false);
      setWebOpen(false);
      Alert.alert(
        'Estado de cuenta importado',
        `Nuevos: ${summary.inserted}\nYa existían: ${summary.duplicated}\n` +
          (summary.fromDate ? `Del ${summary.fromDate} al ${summary.toDate}` : ''),
      );
    } catch (e: any) {
      setImporting(false);
      setWebBusy(false);
      Alert.alert('Error al guardar', e?.message ?? String(e));
    }
  };

  const onParseError = (msg: string) => {
    setPdfBase64(null);
    setXlsxBase64(null);
    setImporting(false);
    setWebBusy(false);
    Alert.alert('Error leyendo el archivo', msg);
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Mercantil' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: AppColors.fondo }}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 + insets.bottom }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadState();
            }}
          />
        }>
        {!hasCreds && (
          <Card>
            <Card.Content style={{ gap: 8 }}>
              <Text variant="titleMedium">Guarda tu usuario y clave primero</Text>
              <Text style={{ color: '#666', fontSize: 13 }}>
                Para copiarlos rápido en el login del banco, guárdalos en Ajustes. Es opcional — puedes
                escribirlos a mano cada vez si prefieres.
              </Text>
              <Button mode="contained" icon="cog" onPress={() => router.push('/ajustes' as never)}>
                Ir a Ajustes
              </Button>
            </Card.Content>
          </Card>
        )}

        <Card>
          <Card.Content style={{ gap: 10 }}>
            <Text variant="titleMedium">Estado de cuenta</Text>
            <Text style={{ color: '#666', fontSize: 13 }}>
              Ya tienes {movementsCount} movimientos importados desde Mercantil.
            </Text>
            <Button mode="contained" icon="web" onPress={onOpenBankWeb}>
              Abrir banco y descargar
            </Button>
            <Divider style={{ marginVertical: 4 }} />
            <Button mode="outlined" icon="file-upload" onPress={onPickPdf}>
              Importar PDF o Excel desde el teléfono
            </Button>
            <HelperText type="info" visible>
              Acepta estado de cuenta (PDF) y detalle de cuenta (PDF o Excel).
            </HelperText>
          </Card.Content>
        </Card>
      </ScrollView>

      <Modal visible={webOpen} onRequestClose={() => setWebOpen(false)} animationType="slide">
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          <Appbar.Header>
            <Appbar.BackAction onPress={() => setWebOpen(false)} />
            <Appbar.Content title="Mercantil" subtitle={webUrl} />
            {hasCreds && <Appbar.Action icon="fingerprint" accessibilityLabel="Iniciar con biometría" onPress={onBiometricLogin} />}
            <Appbar.Action icon="sync" accessibilityLabel="Sincronizar movimientos" onPress={() => webRef.current?.injectJavaScript(SYNC_JS)} />
            <Appbar.Action icon="file-document" onPress={goToStatements} />
            <Appbar.Action icon="refresh" onPress={() => webRef.current?.reload()} />
          </Appbar.Header>
          {webBusy && (
            <View
              style={{
                padding: 12,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: '#EEF',
              }}>
              <ActivityIndicator />
              <Text>Descargando y leyendo el PDF...</Text>
            </View>
          )}
          <WebView<{}>
            ref={webRef}
            source={{ uri: webUrl }}
            originWhitelist={['https://*.mercantilbanco.com', 'https://mercantilbanco.com']}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            injectedJavaScriptBeforeContentLoaded={DOWNLOAD_INTERCEPT_JS}
            onMessage={onWebMessage}
            onNavigationStateChange={onWebNav}
            onShouldStartLoadWithRequest={onShouldStart}
            onFileDownload={(e) => {
              const url = e.nativeEvent.downloadUrl;
              webRef.current?.injectJavaScript(`(function(){
                fetch(${JSON.stringify(url)}, { credentials: 'include' }).then(r => r.blob()).then(b => {
                  const r = new FileReader();
                  r.onload = () => window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'pdf', filename: 'estado.pdf', base64: String(r.result).split(',')[1] || '' }));
                  r.readAsDataURL(b);
                });
              })(); true;`);
            }}
          />
        </View>
      </Modal>

      {(importing || webBusy) && (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.35)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          pointerEvents="none">
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}

      <PdfStatementParser base64={pdfBase64} onResult={onParseResult} onError={onParseError} />
      <XlsxStatementParser base64={xlsxBase64} onResult={onParseResult} onError={onParseError} />

      <Snackbar visible={!!snack} onDismiss={() => setSnack(null)} duration={3000}>
        {snack ?? ''}
      </Snackbar>
    </>
  );
}
