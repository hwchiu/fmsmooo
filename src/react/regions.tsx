import {registerRegionRenderer} from './region-api.mjs';
/**
 * React rendering boundary for the retained FIELDWORK feature controllers.
 * Templates are parsed into React elements, never injected as live HTML.
 * Controller event delegation and Cytoscape remain imperative interop code.
 * A region replacement has the same reset semantics as the original renderer.
 */
import React, {type ReactNode} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {flushSync} from 'react-dom';
import parse,{attributesToProps,domToReact,Element,type DOMNode,type HTMLReactParserOptions} from 'html-react-parser';
type Position={node:Node;parent:Node};
type Region={root:Root;host:ElementHost;positions:Position[];inserted:boolean;disposed:boolean};
type ElementHost=globalThis.Element;
const regions=new Set<Region>();
const hosts=new WeakMap<ElementHost,Region>();
const options:HTMLReactParserOptions={replace(node){
 if(!(node instanceof Element))return;
 // Browser templates use option[selected]. React owns selection on select.
 if(node.name==='select'){
  const props=attributesToProps(node.attribs,node.name) as React.SelectHTMLAttributes<HTMLSelectElement>;
  const selected=node.children.filter((n):n is Element=>n instanceof Element&&n.name==='option'&&Object.hasOwn(n.attribs,'selected'));
  if(selected.length)props.defaultValue=props.multiple?selected.map(n=>n.attribs.value):selected[0].attribs.value;
  return React.createElement('select',props,domToReact(node.children as DOMNode[],options));
 }
 if(node.name==='option'&&Object.hasOwn(node.attribs,'selected')){
  const props=attributesToProps(node.attribs,node.name);delete props.selected;
  return React.createElement('option',props,domToReact(node.children as DOMNode[],options));
 }
}};
function WorkspaceRegion({children}:{children:ReactNode}){return <>{children}</>}
function DecisionWorkspaceRegion({children}:{children:ReactNode}){return <>{children}</>}
function BatchWorkspaceRegion({children}:{children:ReactNode}){return <>{children}</>}
function EvidenceRegion({children}:{children:ReactNode}){return <>{children}</>}
function TemplateRegion({children}:{children:ReactNode}){return <>{children}</>}
function view(host:ElementHost,markup:string){
 const C=host.id==='workspace'?WorkspaceRegion:host.id==='decisionDesk'?DecisionWorkspaceRegion:host.id==='batchDesk'?BatchWorkspaceRegion:/evidence|detail|drawer/i.test(host.id)?EvidenceRegion:TemplateRegion;
 return <C>{parse(markup,options)}</C>;
}
function capture(host:Node){const positions:Position[]=[];function walk(parent:Node){for(const node of Array.from(parent.childNodes)){positions.push({node,parent});walk(node)}}walk(host);return positions;}
function dispose(record:Region){
 if(record.disposed)return;record.disposed=true;
 const owned=new Set(record.positions.map(x=>x.node));
 // Dispose child islands, including evidence panels moved to the drawer.
 for(const nested of [...regions])if(nested!==record&&!nested.disposed&&owned.has(nested.host))dispose(nested);
 // Feature controllers may wrap/move nodes before Cytoscape mounts. Restore
 // React-owned parentage before unmount, so React can clean its own tree.
 for(const {node,parent} of record.positions)if(node.parentNode!==parent)parent.appendChild(node);
 flushSync(()=>record.root.unmount());
 regions.delete(record);hosts.delete(record.host);
}
function mount(host:ElementHost,markup:string,inserted=false){
 const root=createRoot(host);flushSync(()=>root.render(view(host,markup)));
 const record:Region={root,host,positions:capture(host),inserted,disposed:false};
 regions.add(record);hosts.set(host,record);return record;
}
export function renderRegion(host:ElementHost|null,markup:unknown){
 if(!host)throw Error('Missing React region container');
 const existing=hosts.get(host);if(existing)dispose(existing);
 // Empty any non-React children created by graph/controller interop.
 host.replaceChildren();mount(host,String(markup??''));return markup;
}
export function insertRegion(anchor:ElementHost,position:InsertPosition,markup:unknown){
 const host=document.createElement('div');const record=mount(host,String(markup??''),true);
 const nodes=Array.from(host.childNodes);
 const fragment=document.createDocumentFragment();nodes.forEach(n=>fragment.append(n));
 if(position==='beforebegin')anchor.before(fragment);
 else if(position==='afterend')anchor.after(fragment);
 else if(position==='afterbegin')anchor.prepend(fragment);
 else anchor.append(fragment);
 return record;
}
export function replaceRegion(host:ElementHost,markup:unknown){insertRegion(host,'beforebegin',markup);host.remove();return markup;}
let queued=false;
new MutationObserver(()=>{
 if(queued)return;queued=true;queueMicrotask(()=>{queued=false;
  for(const record of [...regions]){
   const attached=record.host.isConnected||record.positions.some(p=>p.node.isConnected);
   // Nested output can be prepared detached synchronously, then inserted.
   if(!attached)dispose(record);
  }
 });
}).observe(document.body,{childList:true,subtree:true});
export const renderingInfo=()=>({framework:'React',version:React.version,regions:regions.size});
Object.defineProperty(window,'__fieldworkRendering',{value:renderingInfo,configurable:true});

registerRegionRenderer({renderRegion,replaceRegion,insertRegion});
