// Run with: node tests/wizard-calculations.cjs (no dependencies or network).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const context = vm.createContext({
  console, window: {}, document: { addEventListener() {}, getElementById() { return null; } },
  localStorage: { getItem() { return null; } },
});
for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
  if (match[1].trim()) vm.runInContext(match[1], context);
}
const {Wizard, Guide, Products} = vm.runInContext('({Wizard, Guide, Products})', context);
Wizard.renderStep = () => {};
vm.runInContext('Toast.error = message => { globalThis.lastError = message; }', context);
function reset(wifi, monitors, floors = 5) {
  Wizard.state = {step:8, hasWifi:wifi, totalMonitors:monitors, fractions:monitors, floors,
    selectedMonitor:Products.getByRef(wifi?'DS-KH7100EY-WE2':'DS-KH7100EY-E2'),
    selectedModulos:[], selectedAcessorios:[], patamarQty:null};
  Wizard.computeAutoItems();
}
const qty = ref => Wizard.state.autoItems.find(p => p.ref === ref)?.qty || 0;
for (const [monitors, groups] of [[1,1],[22,1],[23,2],[44,2],[45,3],[66,3],[67,4],[88,4],[89,5],[500,23]]) {
  reset(true, monitors);
  assert.equal(qty('DS-KAW150-4N'), groups, `${monitors} Wi-Fi: sources`);
  assert.equal(qty('DS-KAD7060EY'), 1);
  assert.equal(qty('DS-KAD7060EY-S'), groups-1, `${monitors} Wi-Fi: expansion distributors`);
  assert.equal(qty('DS-KAD7061EY'), 5, 'patamar count follows floors, not monitor count');
  assert(Wizard.validateStep());
}
reset(false,66);
assert.equal(qty('DS-KAW150-4N'),1);
assert.equal(qty('DS-KAD7060EY'),1);
assert.equal(qty('DS-KAD7060EY-S'),0);
assert(Wizard.validateStep());
reset(false,67);
assert.equal(Wizard.validateStep(),false);
Wizard.selectMonitor('DS-KH7100EY-WE2');
assert.equal(Wizard.state.hasWifi,true);
assert.equal(qty('DS-KAW150-4N'),4);
Wizard.selectMonitor('DS-KH7100EY-E2');
assert.equal(Wizard.state.hasWifi,true,'invalid wired model does not replace valid Wi-Fi selection');
reset(true,45);
Wizard.setPatamarQty(9);
Wizard.computeAutoItems();
assert.equal(qty('DS-KAD7061EY'),9,'manual quantity survives recalculation');
Wizard.setPatamarQty(0);
assert.equal(qty('DS-KAD7061EY'),9,'invalid quantities are rejected');
const items=Wizard.buildFinalItems();
assert.equal(items.find(p=>p.ref==='DS-KAW150-4N').qty,3);
assert.equal(items.find(p=>p.ref==='DS-KAD7061EY').qty,9);
assert.equal(items[0].guidedConfiguration.building.floors,5);
assert.equal(items[0].guidedConfiguration.patamarQty,9);
for(const item of items)assert.equal(item.subtotal,item.qty*item.unitPrice);
Guide.setBuilding('floors',7);
Wizard.computeAutoItems();
assert.equal(qty('DS-KAD7061EY'),7,'changing floors resets the manual quantity');
Wizard.setPatamarQty(10);Wizard.setPatamarQty(null);
assert.equal(qty('DS-KAD7061EY'),7);
Wizard.state.monitorsPerFraction=false;
assert.equal(Guide.sequence()[0],11);
assert(!Guide.sequence().includes(4),'no standalone Wi-Fi step');
assert(!Guide.sequence().includes(3),'no total step without extra monitors');
Wizard.state.monitorsPerFraction=true;
assert(Guide.sequence().includes(3));
assert(Guide.sequence().indexOf(8)<Guide.sequence().indexOf(7),'model selection precedes automatic bill');
console.log('PASS: capacity boundaries, wired limit, floor quantities, overrides, totals, metadata and navigation');
