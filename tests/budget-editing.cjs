// Run with: node tests/budget-editing.cjs (no dependencies or network).
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const html=fs.readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
const elements=new Map();
const element=()=>({value:'',textContent:'',style:{},classList:{add(){},remove(){}},scrollTop:0});
for(const id of ['wizard-overlay','wClientName','wClientEmail'])elements.set(id,element());
const queryCalls=[];
let queryResult={data:{id:'budget-1',updated_at:'2026-10-23T12:00:00Z'},error:null};
const client={from(table){return{update(row){queryCalls.push({table,row});return{eq(key,id){queryCalls.at(-1).filter={key,id};return{select(columns){queryCalls.at(-1).columns=columns;return{async single(){return queryResult}}}}}}}}}};
const context=vm.createContext({console,crypto,window:{},supabase:{createClient:()=>client},
 document:{addEventListener(){},getElementById(id){return elements.get(id)||null},querySelector(){return null}},
 localStorage:{getItem(){return null}},sessionStorage:{getItem(){return null}},
 Swal:{fire(){return Promise.resolve({isConfirmed:false})},DismissReason:{cancel:'cancel'}}});
for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(match[1].trim())vm.runInContext(match[1],context);
const {Wizard,Pages,Storage,Auth,Products,DB}=vm.runInContext('({Wizard,Pages,Storage,Auth,Products,DB})',context);
Wizard.renderStep=()=>{};Wizard.renderProgress=()=>{};
vm.runInContext('LayoutViewport.cancel=()=>{};App.swalOpts=()=>({});Toast.error=message=>{globalThis.lastError=message};DB.insertActivity=async()=>{};',context);
const clone=value=>JSON.parse(JSON.stringify(value));
const bill=items=>clone(items.map(({ref,qty,unitPrice,subtotal})=>({ref,qty,unitPrice,subtotal}))).sort((a,b)=>a.ref.localeCompare(b.ref));
Auth.currentUser={id:'commercial',adminId:'admin',name:'Commercial',role:'comercial'};
function initial(){
 Wizard.open();
 Object.assign(Wizard.state,{step:10,fractions:71,totalMonitors:71,monitorsPerFraction:false,
  floors:5,verticalRoute:'shaft',landingBox:'landing',finish:'inox',hasWifi:false,
  selectedMonitor:Products.getByRef('DS-KH7100EY-E2'),selectedPlaca:Products.getByRef('DS-KD7003EY-IME2'),
  clientName:'Cliente "Teste"',clientEmail:'test@example.com',discount:10,
  selectedModulos:[{...Products.getByRef('DS-KD-KK/S'),qty:2,unitPrice:70,subtotal:140}],
  selectedAcessorios:[{...Products.getByRef('DS-KD-ACW2/S'),qty:2,unitPrice:80,subtotal:160}],
  installation:{version:2,bases:[{ref:'DS-KD-ACW2/S',key:'base-1',x:180,y:20,slots:['DS-KD7003EY-IME2#0','DS-KD-KK/S#0']}]}});
 elements.get('wClientName').value=Wizard.state.clientName;
 elements.get('wClientEmail').value=Wizard.state.clientEmail;
}
function budget(){return{id:'budget-1',comercialId:'commercial',adminId:'admin',status:'sent',priceMode:'pvp',createdAt:'2026-01-01T00:00:00Z',
 clientName:Wizard.state.clientName,clientEmail:Wizard.state.clientEmail,discount:10,fractions:71,totalMonitors:Wizard.finalMonitorCount(),
 monitorsPerFraction:false,hasWifi:false,items:clone(Wizard.buildFinalItems())}}
(async()=>{
 initial();Wizard.setFinalQty('DS-KH7100EY-E2',73);Wizard.setFinalQty('DS-KAW150-4N',5);Wizard.setFinalQty('DS-KD-KK/S',0);
 const b=budget(),original=clone(b),originalBill=bill(b.items);
 Wizard.open(b);
 assert.equal(Wizard.state.step,10);assert.equal(Wizard.state.totalMonitors,71);assert.equal(Wizard.finalMonitorCount(),73);
 assert.deepEqual(bill(Wizard.buildFinalItems()),originalBill,'reopen preserves quantities, removals and prices');
 assert.deepEqual(clone(Wizard.state.installation),b.items[0].installationLayout,'layout restored');
 Wizard.state.installation.bases[0].x=400;
 assert.deepEqual(b,original,'editing never mutates saved record before save');
 Wizard.restoreFinalProduct('DS-KD-KK/S');
 assert.equal(Wizard.buildFinalItems().find(i=>i.ref==='DS-KD-KK/S').qty,2,'removed modules restore from saved selection');
 const legacy=clone(b);delete legacy.items[0].guidedConfiguration.selection;
 legacy.items.find(i=>i.ref==='DS-KAD7061EY').qty=5;
 legacy.items.find(i=>i.ref==='DS-KAD7061EY').subtotal=legacy.items.find(i=>i.ref==='DS-KAD7061EY').unitPrice*5;
 Wizard.open(legacy);
 assert.deepEqual(bill(Wizard.buildFinalItems()),bill(legacy.items),'legacy budgets preserve saved material and prices');
 Wizard.setPatamarQty(null);
 assert.equal(Wizard.buildFinalItems().find(i=>i.ref==='DS-KAD7061EY').qty,19,'legacy budget can restore corrected automatic count');
 Storage.set('app_budgets',[b]);Wizard.open(b);
 Auth.currentUser={id:'admin',name:'Admin',role:'admin'};
 elements.get('wClientName').value='Cliente atualizado';elements.get('wClientEmail').value='';
 Wizard.state.discount=15;Wizard.setFinalQty('DS-KH7100EY-E2',71);
 let inserts=0;DB.insertBudget=async()=>{inserts++};
 await Wizard.saveBudget();
 const saved=Storage.get('app_budgets')[0],write=queryCalls.at(-1);
 assert.equal(inserts,0);assert.equal(Storage.get('app_budgets').length,1);
 for(const key of ['id','comercialId','adminId','createdAt','status'])assert.equal(saved[key],b[key],`preserves ${key}`);
 assert.equal(saved.clientName,'Cliente atualizado');assert.equal(saved.clientEmail,'');assert.equal(saved.discount,15);
 assert.equal(write.row.total_monitors,71);assert.equal(write.row.monitors_per_fraction,false);assert.equal(write.row.has_wifi,false);
 assert.equal(write.row.client_name,'Cliente atualizado');assert.equal(write.row.client_email,'');
 assert.equal(write.filter.id,b.id);assert(!('comercialId' in write.row));assert(!('comercial_id' in write.row));assert(!('createdAt' in write.row));
 assert.equal(saved.totals.total,saved.totals.subtotal*.85*1.23);
 const beforeFailure=clone(saved);Wizard.open(saved);Wizard.state.discount=40;
 queryResult={data:null,error:{message:'Sem ligação'}};await Wizard.saveBudget();
 assert.deepEqual(clone(Storage.get('app_budgets')[0]),beforeFailure,'failed save leaves original intact');assert.equal(context.lastError,'Sem ligação');assert.equal(Wizard.state.saving,false);
 queryResult={data:null,error:null};await Wizard.saveBudget();
 assert.deepEqual(clone(Storage.get('app_budgets')[0]),beforeFailure,'zero updated rows never reports success');
 queryResult={data:{id:b.id,updated_at:'2026-10-23T12:01:00Z'},error:null};
 await Wizard.saveBudget();assert.equal(Storage.get('app_budgets')[0].discount,40,'save can retry after failure');
 const pendingCalls=queryCalls.length;Auth.currentUser={id:'other',role:'comercial'};await Wizard.saveBudget();assert.equal(queryCalls.length,pendingCalls,'unrelated user cannot update');
 for(const [role,id,allowed] of [['comercial','commercial',true],['admin','admin',true],['admin','other',false],['gestor','manager',true],['superadmin','super',true]]){
  Auth.currentUser={role,id};assert.equal(Pages.canEditBudget(b),allowed);
 }
 Auth.currentUser={id:'commercial',adminId:'admin',name:'Commercial',role:'comercial'};initial();
 assert.equal(Wizard.state.editingBudgetId,undefined);assert.equal(Wizard.state.savedPrices,undefined,'new budget has current prices');
 let release;DB.insertBudget=()=>{inserts++;return new Promise(resolve=>release=resolve)};
 const first=Wizard.saveBudget();await Wizard.saveBudget();assert.equal(inserts,1,'double click inserts once');release();await first;
 assert.equal(Storage.get('app_budgets').length,2);
 console.log('PASS: edit/reopen, legacy budgets, removals, layout, prices, same ID, owner, status, dates, totals, database mapping, errors, retry, access and double-save');
})().catch(error=>{console.error(error);process.exitCode=1});
