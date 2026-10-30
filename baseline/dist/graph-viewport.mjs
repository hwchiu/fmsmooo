// Keep user navigation separate from graph data and DOM lifetimes.
export class GraphViewportStore {
 constructor(){this.views=new Map();this.current=null;this.lastZoom=.75;}
 remember(){const c=this.current;if(!c||c.cy.destroyed())return;const cy=c.cy;this.lastZoom=cy.zoom();this.views.set(c.key,{zoom:cy.zoom(),pan:{...cy.pan()},positions:new Map(cy.nodes().map(n=>[n.id(),{...n.position()}]))});}
 mount(cy,key,center){const saved=this.views.get(key);this.current={cy,key};cy.batch(()=>{if(saved){for(const n of cy.nodes()){const pos=saved.positions.get(n.id());if(pos)n.position(pos)}cy.zoom(saved.zoom);cy.pan(saved.pan)}else{cy.zoom(this.lastZoom);if(center?.length)cy.center(center);else if(cy.nodes().length)cy.center(cy.nodes().first())}});}
}
export const graphViewports=new GraphViewportStore();
