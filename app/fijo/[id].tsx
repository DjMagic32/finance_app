import { eq } from 'drizzle-orm';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import FijoForm from '@/components/FijoForm';
import { db } from '@/db';
import { recurring, type Recurring } from '@/db/schema';

export default function EditarFijo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [row, setRow] = useState<Recurring | null>(null);

  useEffect(() => {
    db.select()
      .from(recurring)
      .where(eq(recurring.id, Number(id)))
      .limit(1)
      .then((rows) => setRow(rows[0] ?? null));
  }, [id]);

  if (!row) return null;
  return <FijoForm existing={row} onDone={() => router.back()} />;
}
