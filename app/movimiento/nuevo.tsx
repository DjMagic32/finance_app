import { useRouter } from 'expo-router';

import MovimientoForm from '@/components/MovimientoForm';

export default function NuevoMovimiento() {
  const router = useRouter();
  return <MovimientoForm onDone={() => router.back()} />;
}
