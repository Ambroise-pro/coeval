'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const C=require('../coeval-core'),W=require('../coeval-workflow'),D=require('../coeval-demo');
const fresh=()=>({id:'ep',title:'Classe',candidates:[],mine:{},others:{},final:{},history:[]});
test('aperçu CSV : doublons, homonymes et lignes vides sans mutation',()=>{
 const ep=fresh();C.addCandidates(ep,['Alice'],['TG1']);const before=C.clone(ep);
 assert.deepEqual(W.csvPreview(ep,['ALICE','Bob','bob',''],['TG2']).map(r=>r.status),['duplicate','new','duplicate','empty']);assert.deepEqual(ep,before);
});
test('recherche, groupes et ordre de passage',()=>{
 const ep=fresh();C.addCandidates(ep,['Zoé','Alice','Bob']);ep.candidates.forEach(c=>c.group='A');ep.candidates.find(c=>c.name==='Zoé').order=1;
 assert.equal(W.candidates(ep,{group:'A'})[0].name,'Zoé');assert.equal(W.candidates(ep,{search:'alice'}).length,1);assert.equal(W.candidates(ep,{group:'B'}).length,0);
});
test('renommage : notes reçues conservées, anciens noms reconnus aux imports',()=>{
 const ep=D.makeDemo('Alice',1),c=ep.candidates[0],old=c.name,key=C.normName(old),author=Object.keys(ep.others)[0],ev=C.clone(ep.others[author].rows[key]);
 W.editCandidate(ep,c.id,{name:'Nouveau nom',classroom:'TG3',group:'A',situation:'absent'});
 assert.deepEqual(ep.others[author].rows['nouveau nom'],ev);assert.equal(ep.others[author].rows[key],undefined);
 C.importPayloads(ep,[{v:1,by:author,title:ep.title,at:1,rows:[[old]],batch:'another'}],'Alice');
 assert.equal(ep.candidates.length,28);assert.deepEqual(ep.others[author].rows['nouveau nom'],ev);
 assert.throws(()=>W.editCandidate(ep,c.id,{name:ep.candidates[1].name}));
});
test('corbeille : restaure la fiche, la validation et toutes les évaluations reçues',()=>{
 const ep=D.makeDemo('Alice',1),c=ep.candidates[0],before=C.clone(ep);
 W.trashCandidate(ep,c.id);assert.equal(ep.candidates.length,27);assert.equal(ep.mine[c.id],undefined);
 W.restoreCandidate(ep,ep.trash[0].id);assert.deepEqual(ep.candidates,before.candidates);assert.deepEqual(ep.mine,before.mine);assert.deepEqual(ep.others,before.others);assert.deepEqual(ep.final,before.final);
});
test('restauration refuse de remplacer un homonyme ajouté depuis la suppression',()=>{
 const ep=fresh();C.addCandidates(ep,['Alice']);W.trashCandidate(ep,ep.candidates[0].id);C.addCandidates(ep,['Alice']);const before=C.clone(ep);
 assert.throws(()=>W.restoreCandidate(ep,ep.trash[0].id));assert.deepEqual(ep,before);
});
test('import transactionnel : un lot invalide ne modifie pas la destination',()=>{
 const ep=fresh(),source=D.makeDemo('Collègue',1),p=C.fileToPayload(C.exportFile(source,'Collègue')),before=C.clone(ep);
 const good=W.previewImport(ep,[p],'Prof');assert.ok(good.ep);assert.deepEqual(ep,before);
 const bad=W.previewImport(ep,[p,{...p,v:999}],'Prof');assert.ok(bad.error);assert.deepEqual(ep,before);
 assert.ok(W.previewImport(ep,[{...p,part:[0,3]}],'Prof').error);
});
test('situations administratives : exclues du suivi de passage sans effacer les notes',()=>{
 const ep=D.makeDemo('Alice',1),c=ep.candidates[0],before=C.clone(ep.mine[c.id]);c.situation='exempt';const s=W.summary(ep,'Alice');assert.equal(s.expected,27);assert.equal(s.special,1);assert.deepEqual(ep.mine[c.id],before);
});
test('accusé : accepté seulement pour les notes, le destinataire et l’épreuve correspondants',()=>{
 const source=D.makeDemo('Alice',1),dest=fresh();dest.title=source.title;
 const res=W.previewImport(dest,[C.fileToPayload(C.exportFile(source,'Alice'))],'Bob');assert.ok(res.ep);
 const r=W.receipt(res.ep,'Alice','Bob');W.acceptReceipt(source,r,'Alice');assert.equal(source.receipts.length,1);
 assert.throws(()=>W.acceptReceipt(source,{...r,to:'Autre'},'Alice'));
 source.mine[source.candidates[0].id].done=false;assert.throws(()=>W.acceptReceipt(source,r,'Alice'));
});
test('sauvegarde complète conserve organisation, corbeille, archives et retours',()=>{
 const ep=D.makeDemo('Alice',1);ep.archived=true;ep.candidates[0].feedback='Continue ainsi';ep.candidates[0].group='A';W.trashCandidate(ep,ep.candidates[1].id);
 const checked=C.checkBackup(C.makeBackup(ep,'Alice'));assert.ok(!checked.error);assert.equal(checked.epreuve.archived,true);assert.equal(checked.epreuve.candidates[0].feedback,'Continue ainsi');assert.equal(checked.epreuve.trash.length,1);
});
test('fusion de sauvegarde : préserve un renommage et récupère les métadonnées plus récentes',()=>{
 const source=D.makeDemo('Alice',Date.now()),target=C.clone(source),c=target.candidates[0],old=c.name;
 W.editCandidate(target,c.id,{name:'Nom corrigé',group:'A',situation:'present'});
 const other=source.candidates[1];other.group='B';other.feedback='Bravo';other.organizationAt=Date.now()+1000;
 C.mergeEpreuve(target,source);
 assert.equal(target.candidates.length,28);assert.equal(target.candidates.find(x=>x.id===c.id).name,'Nom corrigé');
 assert.equal(target.candidates.find(x=>x.id===other.id).feedback,'Bravo');
 Object.values(target.others).forEach(o=>{assert.equal(o.rows[C.normName(old)],undefined);assert.ok(o.rows['nom corrige']);});
});
test('situations différées exclues des validations et de la file automatiques',()=>{
 const ep=D.makeDemo('Alice',Date.now());ep.candidates.forEach(c=>c.situation='postponed');
 assert.equal(C.accordReady(ep,'Alice').length,0);assert.equal(C.harmonizeQueue(ep,'Alice').length,0);
});
test('métadonnées restaurées : normalisation des types non fiables',()=>{
 const ep=fresh();C.addCandidates(ep,['Alice']);Object.assign(ep.candidates[0],{aliases:{x:1},order:'" onfocus="alert(1)',situation:'unknown',feedback:{x:1}});
 const restored=C.checkBackup(C.makeBackup(ep,'Prof')).epreuve.candidates[0];assert.equal(restored.order,0);assert.deepEqual(restored.aliases,[]);assert.equal(restored.situation,'present');assert.equal(restored.feedback,'');
});
