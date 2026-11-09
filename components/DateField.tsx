import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Button, Dialog, Portal, TextInput } from 'react-native-paper';

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
};

function localDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) {
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
    if (date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3])) return date;
  }
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return today;
}

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function DateField({ label, value, onChange, error }: Props) {
  const [iosOpen, setIosOpen] = useState(false);
  const [draft, setDraft] = useState(new Date());
  const open = () => {
    const selected = localDate(value);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: selected, mode: 'date', onChange: (event, date) => { if (event.type === 'set' && date) onChange(isoDate(date)); } });
    } else {
      setDraft(selected); setIosOpen(true);
    }
  };
  if (Platform.OS === 'web') return <TextInput mode="outlined" label={`${label} (AAAA-MM-DD)`} value={value} onChangeText={onChange} error={error} />;
  return <>
    <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`${label}: ${value || 'seleccionar fecha'}`}>
      <View pointerEvents="none"><TextInput mode="outlined" label={label} value={value ? value.split('-').reverse().join('/') : ''} placeholder="Seleccionar fecha" editable={false} error={error} right={<TextInput.Icon icon="calendar" />} /></View>
    </Pressable>
    {Platform.OS === 'ios' && <Portal><Dialog visible={iosOpen} onDismiss={() => setIosOpen(false)}>
      <Dialog.Title>{label}</Dialog.Title><Dialog.Content><DateTimePicker value={draft} mode="date" display="spinner" onChange={(_, date) => { if (date) setDraft(date); }} /></Dialog.Content>
      <Dialog.Actions><Button onPress={() => setIosOpen(false)}>Cancelar</Button><Button onPress={() => { onChange(isoDate(draft)); setIosOpen(false); }}>Aceptar</Button></Dialog.Actions>
    </Dialog></Portal>}
  </>;
}
