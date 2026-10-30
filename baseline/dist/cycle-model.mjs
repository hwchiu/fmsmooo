import {components,reachable} from './factory-model.mjs';
import {decision} from './decision-model.mjs';
export function cycleAnalysis(before,overrides=new Map(),productTrials=before.trial||new Set()){
 const after=decision(before.ctx,productTrials,overrides),all=new Set(before.by.keys());
 const groups=components(all,before.gates).map((members,i)=>{const set=new Set(members),internal=before.gates.filter(e=>set.has(e.source)&&set.has(e.target)),downstream=reachable(members,before.gates);for(const id of members)downstream.delete(id);const baselineCycles=before.cycles.filter(c=>c.some(id=>set.has(id))),activeCycles=after.cycles.filter(c=>c.some(id=>set.has(id)));return {key:'cycle:'+members.join('|'),code:'C'+String(i+1).padStart(2,'0'),members,internal,downstream,departments:new Set(members.map(id=>before.by.get(id).department_id)),baselineCycles,activeCycles,active:activeCycles.length>0,affected:[...downstream].filter(id=>before.results.get(id).execution==='pending')};});
 const newlyReady=[...after.results.values()].filter(r=>r.candidate&&!before.baselineReady.has(r.node.id));const lostReady=[...before.results.values()].filter(r=>r.candidate&&!after.results.get(r.node.id).candidate);
 return {before,after,groups,newlyReady,lostReady,activeGroups:groups.filter(g=>g.active).length,structuralGroups:groups.length};
}
// Greedy feedback-edge set: structural review candidates, never automatic approval.
export function cycleCandidates(m,group){const ids=new Set(group.members),remaining=group.internal.filter(e=>!m.met(e));const chosen=[];const cycleEdges=edges=>{const sets=components(ids,edges).map(c=>new Set(c));return edges.filter(e=>sets.some(s=>s.has(e.source)&&s.has(e.target)))};let current=remaining;while(cycleEdges(current).length){const candidates=cycleEdges(current);let best=null,bestScore=Infinity;for(const edge of candidates){const score=cycleEdges(current.filter(e=>e.edge_id!==edge.edge_id)).length;if(score<bestScore){bestScore=score;best=edge}}chosen.push(best.edge_id);current=current.filter(e=>e.edge_id!==best.edge_id)}return chosen;}
export function cycleGraphData(analysis,selectedKey,showDownstream=false,scope='active'){
 const group=analysis.groups.find(g=>g.key===selectedKey),nodes=[],edges=[];
 if(!group){const groups=analysis.groups.filter(g=>scope==='all'||(scope==='active'?g.active:!g.active));groups.forEach((g,i)=>nodes.push({id:g.key,kind:'cycle',group:g,members:g.members,x:(i%3)*355,y:Math.floor(i/3)*190}));return {nodes,edges,group:null};}
 const size=group.members.length,radius=size<=1?0:size<=3?170:310;
 group.members.forEach((id,i)=>{const angle=size===2?Math.PI*i:-Math.PI/2+2*Math.PI*i/size;const compact=size===4?[[-180,-110],[180,-110],[180,110],[-180,110]]:size===5?[[-175,-190],[175,-190],[280,0],[0,190],[-280,0]]:null;nodes.push({id:'product:'+id,kind:'product',members:[id],x:compact?compact[i][0]:Math.cos(angle)*radius,y:compact?compact[i][1]:Math.sin(angle)*radius})});
 for(const e of group.internal)edges.push({id:'gate:'+e.edge_id,source:'product:'+e.source,target:'product:'+e.target,kind:'gate',edge:e});
 if(showDownstream){const depts=new Map();for(const id of group.downstream){const n=analysis.before.by.get(id);if(!depts.has(n.department_id))depts.set(n.department_id,[]);depts.get(n.department_id).push(id)}let i=0;for(const [dept,members]of depts){const id='downstream:'+dept;nodes.push({id,kind:'downstream',members,department:analysis.before.by.get(members[0]).department_name,x:radius+610,y:(i++-(depts.size-1)/2)*180});edges.push({id:'impact:'+dept,source:'product:'+group.members[0],target:id,kind:'impact',department:dept})}}
 return {nodes,edges,group};
}
