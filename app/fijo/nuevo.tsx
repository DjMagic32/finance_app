import { useRouter } from 'expo-router';

import FijoForm from '@/components/FijoForm';

export default function NuevoFijo() {
  const router = useRouter();
  return <FijoForm onDone={() => router.back()} />;
}
