export function deploymentVisual(n,r){
 if(r.execution==='done')return {key:'done',label:'部署驗證完成',fill:'#eef4ef',icon:'check'};
 if(n.status==='Failed')return {key:'failed',label:'部署失敗',fill:'#f4f4f3',icon:'alert'};
 if(n.status==='Paused')return {key:'paused',label:'已暫停',fill:'#f4f4f3',icon:'pause'};
 if(n.status==='Ready')return {key:'unknown',label:'完成證據待確認',fill:'#f3f4f4',icon:'question'};
 if(n.status==='Unknown')return {key:'unknown',label:'狀態未知',fill:'#f3f4f4',icon:'question'};
 if(r.execution==='active')return {key:'active',label:'正在部署',fill:'#edf2f5',icon:'progress'};
 if(n.schedule?.confirmed===true&&n.schedule.start)return {key:'scheduled',label:'已安排時程 '+n.schedule.start,fill:'#f0f2f5',icon:'calendar'};
 if(n.schedule?.confirmed===false&&n.schedule?.verified===true)return {key:'unscheduled',label:'未安排時程',fill:'#f4f5f5',icon:'calendarAdd'};
 return {key:'missing',label:'待部署 · 排程資料未提供',fill:'#f4f5f5',icon:'question'};
}
export function fuzzyMatch(value,query){const valueText=value.toLowerCase(),q=query.toLowerCase().trim();if(!q)return true;return q.split(/\s+/).every(token=>{if(valueText.includes(token))return true;if(token.length<3)return false;const words=valueText.split(/[^a-z0-9]+/);return words.some(w=>{if(Math.abs(w.length-token.length)>1)return false;let prev=Array.from({length:token.length+1},(_,i)=>i);for(let i=1;i<=w.length;i++){const next=[i];for(let j=1;j<=token.length;j++)next[j]=Math.min(next[j-1]+1,prev[j]+1,prev[j-1]+(w[i-1]===token[j-1]?0:1));prev=next}return prev[token.length]<=1})})}
export function toggleScope(selected,ids){const clear=ids.length>0&&ids.every(id=>selected.has(id));const next=new Set(selected);for(const id of ids)if(clear)next.delete(id);else next.add(id);return next;}
export function graphStateMatches(n,r,executionFilters,prerequisiteFilters){return (!executionFilters.size||executionFilters.has(deploymentVisual(n,r).key))&&(!prerequisiteFilters.size||prerequisiteFilters.has(r.color));}

export function factoryStatusMatches(r,filter){if(filter==='all')return true;if(filter==='pending')return r.execution==='pending';if(filter==='executed')return r.execution==='done'||r.execution==='active';if(filter==='issues')return r.execution==='pending'&&['red','gray'].includes(r.color);if(filter==='green')return r.candidate;if(['done','active'].includes(filter))return r.execution===filter;return r.execution==='pending'&&r.color===filter;}
