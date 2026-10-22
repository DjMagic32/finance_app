import { eq } from 'drizzle-orm';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import MovimientoAllocationsBar from '@/components/MovimientoAllocationsBar';
import MovimientoForm from '@/components/MovimientoForm';
import { db } from '@/db';
import { transactions, type Transaction } from '@/db/schema';

export default function EditarMovimiento() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [tx, setTx] = useState<Transaction | null>(null);

  useEffect(() => {
    db.select()
      .from(transactions)
      .where(eq(transactions.id, Number(id)))
      .limit(1)
      .then((rows) => setTx(rows[0] ?? null));
  }, [id]);

  if (!tx) return null;

  return (
    <View style={{ flex: 1 }}>
      {tx.type === 'gasto' && <MovimientoAllocationsBar transaction={tx} />}
      <View style={{ flex: 1 }}>
        <MovimientoForm existing={tx} onDone={() => router.back()} />
      </View>
    </View>
  );
}
