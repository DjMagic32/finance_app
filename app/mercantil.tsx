import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Stack, useRouter } from 'expo-router';
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
  copyPasswordWithAutoClear,
  countMercantilMovements,
  getMercantilCreds,
  importMovements,
  isMercantilUrl,
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

export default function MercantilScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [hasCreds, setHasCreds] = useState(false);
  const [savedPassword, setSavedPassword] = useState('');
  const [movementsCount, setMovementsCount] = useState<number>(0);
  const [refreshing, setRefreshing] = useState(false);

  const [webOpen, setWebOpen] = useState(false);
  const [webUrl, setWebUrl] = useState<string>(MERCANTIL_URL);
  const [webBusy, setWebBusy] = useState(false);
  const webRef = useRef<WebView>(null);

  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [xlsxBase64, setXlsxBase64] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);
  const clearHandle = useRef<number | null>(null);

  const loadState = useCallback(async () => {
    const c = await getMercantilCreds();
    setHasCreds(!!c.username && !!c.password);
    setSavedPassword(c.password);
    setMovementsCount(await countMercantilMovements());
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadState();
    return () => {
      if (clearHandle.current) clearTimeout(clearHandle.current);
    };
  }, [loadState]);

  const onCopyPassword = async () => {
    if (!savedPassword) return;
    if (clearHandle.current) clearTimeout(clearHandle.current);
    clearHandle.current = await copyPasswordWithAutoClear(savedPassword);
    setSnack('Copiada. Se borra del portapapeles en 45 s.');
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
        setPdfBase64(msg.base64);
      } else if (msg.type === 'download_error') {
        Alert.alert('No se pudo capturar el PDF', msg.message ?? '');
      }
    } catch {
      // ignoramos
    }
  };

  const onWebNav = (nav: WebViewNavigation) => {
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
    console.log('[Mercantil] parse result count=', movs.length, 'first=', movs[0]);
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
            {hasCreds && (
              <Button mode="text" icon="content-copy" onPress={onCopyPassword}>
                Copiar clave (auto-borra a 45 s)
              </Button>
            )}
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
          <WebView
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
