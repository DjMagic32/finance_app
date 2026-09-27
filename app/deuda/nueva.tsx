import { useRouter } from 'expo-router';

import DeudaForm from '@/components/DeudaForm';

export default function NuevaDeuda() {
  const router = useRouter();
  return <DeudaForm onDone={() => router.back()} />;
}
