import { eq } from 'drizzle-orm';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import DeudaForm from '@/components/DeudaForm';
import { db } from '@/db';
import { debtPayments, debts, type Debt, type DebtPayment } from '@/db/schema';

export default function EditarDeuda() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<{ debt: Debt; payments: DebtPayment[] } | null>(null);

  useEffect(() => {
    (async () => {
      const [debt] = await db
        .select()
        .from(debts)
        .where(eq(debts.id, Number(id)))
        .limit(1);
      if (!debt) return;
      const payments = await db
        .select()
        .from(debtPayments)
        .where(eq(debtPayments.debtId, debt.id))
        .orderBy(debtPayments.dueDate);
      setData({ debt, payments });
    })();
  }, [id]);

  if (!data) return null;
  return (
    <DeudaForm
      existing={data.debt}
      hasPaid={data.payments.some((p) => p.paidAt)}
      firstDueDate={data.payments[0]?.dueDate}
      installmentCount={data.payments.length}
      onDone={() => router.back()}
    />
  );
}
