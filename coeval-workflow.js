/* Organisation locale, aperçus transactionnels et accusés de réception. */
(function(root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./coeval-core.js') : root.CoEvalCore);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CoEvalWorkflow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(C) {
  'use strict';
  const SITUATIONS = {present:'À évaluer', absent:'Absent', exempt:'Dispensé', postponed:'Passage reporté'};
  const eligible = c => !c.situation || c.situation === 'present';
  function candidates(ep, {search='', group='', filter=()=>true} = {}) {
    return ep.candidates.filter(c => C.normName(c.name + ' ' + c.classroom).includes(C.normName(search)) && (!group || c.group === group) && filter(c))
      .sort((a,b) => (a.order || 999999) - (b.order || 999999) || a.name.localeCompare(b.name, 'fr'));
  }
  function summary(ep, me) {
    const all = ep.candidates, list = all.filter(eligible);
    return {total:all.length, expected:list.length, special:all.length-list.length,
      prepared:list.filter(c => { const e=C.get(ep.mine,c.id); return e?.theme && e?.split && e?.role && C.PREP_CRITS.every(id=>e.v?.[id]!=null); }).length,
      done:list.filter(c=>C.get(ep.mine,c.id)?.done).length,
      validated:list.filter(c=>C.get(ep.final,c.id)?.validated).length,
      received:Object.entries(ep.others).map(([name,o])=>({name, missing:list.filter(c=>!C.isFilled(C.get(o.rows,C.normName(c.name)))), complete:list.filter(c=>C.get(o.rows,C.normName(c.name))?.done).length}))};
  }
  function csvPreview(ep, names, classes=[]) {
    const seen=new Set(ep.candidates.flatMap(c=>[c.name,...(c.aliases||[])].map(C.normName)));
    return names.map((raw,i)=>{
      const name=String(raw||'').replace(/\s+/g,' ').trim(), classroom=String(classes[i]||'').trim(), key=C.normName(name);
      const status=!name?'empty':seen.has(key)?'duplicate':'new';
      if(key) seen.add(key);
      return {name,classroom,status};
    });
  }
  function editCandidate(ep,id,fields) {
    const c=ep.candidates.find(c=>c.id===id);
    if(!c) throw new Error('Candidat introuvable.');
    const name=String(fields.name||'').replace(/\s+/g,' ').trim();
    if(!name) throw new Error('Le nom est obligatoire.');
    const key=C.normName(name), old=C.normName(c.name);
    if(ep.candidates.some(x=>x.id!==id && [x.name,...(x.aliases||[])].some(n=>C.normName(n)===key))) throw new Error('Ce nom existe déjà. Distingue les homonymes par un suffixe partagé entre évaluateurs.');
    if(Object.values(ep.others).some(o=>key!==old && C.own(o.rows,key))) throw new Error('Une évaluation reçue porte déjà ce nom.');
    if(key!==old) {
      c.aliases=[...new Set([...(c.aliases||[]),c.name])];
      Object.values(ep.others).forEach(o=>{if(C.own(o.rows,old)){o.rows[key]=o.rows[old];delete o.rows[old];}});
    }
    Object.assign(c,{name,classroom:String(fields.classroom||'').trim(),group:String(fields.group||'').trim(),order:Math.max(0,Number(fields.order)||0),situation:C.own(SITUATIONS,fields.situation)?fields.situation:'present'});
    c.organizationAt=Date.now();
    return c;
  }
  function previewImport(ep,payloads,me) {
    const copy=C.clone(ep);
    if(!Array.isArray(payloads)||!payloads.length) return {error:'Aucune donnée à importer.'};
    try {
      for(const p of payloads) {
        if(!p || !Array.isArray(p.rows) || (p.part && (!Array.isArray(p.part)||p.part.length!==2||!p.part.every(Number.isInteger)||p.part[0]<1||p.part[0]>p.part[1]||p.part[1]>1000))) return {error:'Lot QR invalide.'};
      }
      const result=C.importPayloads(copy,payloads,me);
      return result.error?result:{ep:copy,result};
    } catch(e) { return {error:'Données illisibles : aucun changement appliqué.'}; }
  }
  function trashCandidate(ep,id) {
    const index=ep.candidates.findIndex(c=>c.id===id);
    if(index<0) return;
    const cand=ep.candidates[index], key=C.normName(cand.name), others={};
    Object.entries(ep.others).forEach(([name,o])=>{if(C.own(o.rows,key)){others[name]=o.rows[key];delete o.rows[key];}});
    (ep.trash ||= []).push(C.clone({id:C.uid(),at:Date.now(),cand,index,mine:ep.mine[id],final:ep.final[id],others}));
    ep.candidates.splice(index,1);delete ep.mine[id];delete ep.final[id];
  }
  function restoreCandidate(ep,id) {
    const item=ep.trash?.find(x=>x.id===id);
    if(!item) throw new Error('Élève introuvable dans la corbeille.');
    if(ep.candidates.some(c=>c.id===item.cand.id||C.normName(c.name)===C.normName(item.cand.name))) throw new Error('Un élève de même nom existe déjà : renomme-le avant de restaurer.');
    const key=C.normName(item.cand.name);
    if(Object.keys(item.others).some(name=>C.own(ep.others[name]?.rows||{},key))) throw new Error('Des fiches reçues portent déjà ce nom. Restauration interrompue pour les préserver.');
    ep.candidates.splice(Math.min(item.index,ep.candidates.length),0,item.cand);
    if(item.mine) ep.mine[item.cand.id]=item.mine;
    if(item.final) ep.final[item.cand.id]=item.final;
    Object.entries(item.others).forEach(([name,row])=>{(ep.others[name] ||= {rows:{}}).rows[key]=row;});
    ep.trash=ep.trash.filter(x=>x.id!==id);
  }
  // Le reçu porte sur les notes effectivement reçues, sans authentifier son auteur.
  function fingerprint(ep) {
    const rows=C.exportRows(ep).filter(r=>Array.isArray(r[4])).map(r=>[C.normName(r[0]),...r.slice(1,5),r[6]]).sort((a,b)=>a[0].localeCompare(b[0]));
    return C.hash(JSON.stringify(rows));
  }
  function receipt(ep,author,me) {
    const other=C.get(ep.others,author);
    if(!other) throw new Error('Aucune évaluation reçue.');
    const mine={};ep.candidates.forEach(c=>{mine[c.id]=C.get(other.rows,C.normName(c.name));});
    return {type:'coeval-receipt',version:1,title:ep.title,to:author,by:me,at:Date.now(),fingerprint:fingerprint({...ep,mine})};
  }
  function acceptReceipt(ep,r,me) {
    if(r?.type!=='coeval-receipt'||r.version!==1||typeof r.by!=='string'||!r.by.trim()||!Number.isFinite(r.at)||C.normName(r.to)!==C.normName(me)||C.normName(r.title)!==C.normName(ep.title)||r.fingerprint!==fingerprint(ep)) throw new Error('Ce reçu ne correspond pas à cette épreuve et à la version actuelle de tes notes.');
    const list=ep.receipts ||= [];
    ep.receipts=[...list.filter(x=>C.normName(x.by)!==C.normName(r.by)),C.clone(r)];
  }
  return {SITUATIONS,eligible,candidates,summary,csvPreview,editCandidate,previewImport,trashCandidate,restoreCandidate,fingerprint,receipt,acceptReceipt};
});
