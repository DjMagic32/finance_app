const {DatabaseSync}=require('node:sqlite');
const {createRequire}=require('module');
const req=createRequire(process.cwd()+'/package.json');
const ts=req('typescript'), fs=require('fs'), vm=require('vm'), assert=require('assert');
const raw=new DatabaseSync(':memory:');
for(const file of fs.readdirSync('drizzle').filter(s=>/^\d+.*\.sql$/.test(s)).sort()) raw.exec(fs.readFileSync('drizzle/'+file,'utf8').replaceAll('--> statement-breakpoint',''));
const client={prepareSync(query){const stmt=raw.prepare(query); const returns=stmt.columns().length>0; return {
 executeSync(params){ if(returns){stmt.setReturnArrays(false);const rows=stmt.all(...params);return {getAllSync:()=>rows,getFirstSync:()=>rows[0],changes:0,lastInsertRowId:0}} const r=stmt.run(...params);return {changes:r.changes,lastInsertRowId:r.lastInsertRowid}},
 executeForRawResultSync(params){stmt.setReturnArrays(true);const rows=stmt.all(...params);return {getAllSync:()=>rows}}
}}};
const {drizzle}=req(process.cwd()+'/node_modules/drizzle-orm/expo-sqlite/driver.cjs'); const db=drizzle(client);
function load(path, resolver){const src=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;const m={exports:{}};vm.runInNewContext(src,{module:m,exports:m.exports,require:resolver,Date,console});return m.exports}
const schema=load('db/schema.ts',req);
const notifications={cancelReminders:async()=>{},schedulePaymentReminders:async()=>[],scheduleOverdueAlert:async()=>{}};
const api=load('services/debts.ts',x=>x==='@/db'?{db,nowISO:()=>new Date().toISOString(),todayISO:()=> '2026-11-09'}:x==='@/db/schema'?schema:x==='@/services/notifications'?notifications:req(x));
let html = '';
let shared = '';
const receipts=load('services/debtReceipt.ts', x => x==='@/db' ? {db,todayISO:()=> '2026-11-09'} : x==='@/db/schema' ? schema : x==='@/services/debts' ? api : x==='expo-print' ? {printToFileAsync:async v=>{html=v.html;return {uri:'file:///test.pdf'}}} : x==='expo-sharing' ? {isAvailableAsync:async()=>true,shareAsync:async uri=>{shared=uri}} : req(x));
raw.exec("INSERT INTO debts (creditor,description,total_amount,currency,total_amount_usd,start_date,due_date,schedule,installment_amount,status,created_at) VALUES ('Test <empresa>','Trabajo & gastos',100,'USD',100,'2026-11-01','2026-12-01','mensual',50,'activa','now'); INSERT INTO debt_payments (debt_id,due_date,amount,notification_ids) VALUES (1,'2026-11-10',50,'[]'),(1,'2026-12-01',50,'[]'); INSERT INTO transactions (type,amount,currency,amount_usd,amount_ves,date,created_at) VALUES ('gasto',50,'USD',50,5000,'2026-11-09','now')");
(async()=>{
 await assert.rejects(receipts.sharePaidDebtReceipt(1),/pagada/);
 await api.linkExpenseToDebt(1,1,5000);
 await api.markPaymentPaid(2);
 await receipts.sharePaidDebtReceipt(1);
 assert.equal(shared,'file:///test.pdf');
 assert.ok(html.includes('Test &lt;empresa&gt;'));
 assert.ok(html.includes('Trabajo &amp; gastos'));
 assert.ok(html.includes('Movimiento del 09/11/2026'));
 assert.ok(html.includes('sin movimiento vinculado'));
 assert.ok(html.includes('No es una factura fiscal'));
 console.log('PDF verificado: deuda pagada, movimiento vinculado, cuota manual y texto escapado.');
})().catch(e=>{console.error(e);process.exitCode=1});
