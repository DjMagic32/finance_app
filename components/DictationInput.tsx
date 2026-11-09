import { useRef, type ComponentProps } from 'react';
import { Alert, Platform, type TextInputInstance } from 'react-native';
import { TextInput } from 'react-native-paper';

type Props = ComponentProps<typeof TextInput> & { value: string; onChangeText: (value: string) => void };

/** Android keyboards can provide voice input without launching an external activity. */
export default function DictationInput({ value, onChangeText, right, ...props }: Props) {
  const inputRef = useRef<TextInputInstance>(null);
  const dictate = () => Alert.alert(
    'Dictar con el teclado',
    'Al abrirse el teclado, pulsa su icono de micrófono y empieza a hablar.',
    [{ text: 'Abrir teclado', onPress: () => setTimeout(() => inputRef.current?.focus(), 200) }],
  );
  return <TextInput {...props} ref={inputRef} value={value} onChangeText={onChangeText} right={Platform.OS === 'android' && !right ? <TextInput.Icon icon="microphone" accessibilityLabel="Abrir teclado para dictar" onPress={dictate} /> : right} />;
}
