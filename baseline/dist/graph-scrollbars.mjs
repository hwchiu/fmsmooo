export function scrollAxisBounds(start,end,viewport,pan,padding=36){const min=Math.min(start-padding,-pan),max=Math.max(end+padding,-pan+viewport);return {min,max,size:Math.max(viewport,max-min),offset:-pan-min};}
export function bindGraphScrollbars(cy){
 const host=cy.container(),frame=host.closest('.graph-frame');if(!frame)return;
 const xbar=frame.querySelector('.graph-scroll-x'),ybar=frame.querySelector('.graph-scroll-y');
 let ticket=0,bounds=null,dirty=true,axes=null,disposed=false;
 const sync=()=>{ticket=0;if(disposed||cy.destroyed())return;if(dirty){bounds=cy.elements().boundingBox({includeLabels:false,includeOverlays:false});dirty=false}const pan=cy.pan(),zoom=cy.zoom(),w=cy.width(),h=cy.height();if(!cy.nodes().length)return;
 axes={x:scrollAxisBounds(bounds.x1*zoom,bounds.x2*zoom,w,pan.x),y:scrollAxisBounds(bounds.y1*zoom,bounds.y2*zoom,h,pan.y)};
 xbar.firstElementChild.style.width=axes.x.size+'px';ybar.firstElementChild.style.height=axes.y.size+'px';
 xbar.scrollLeft=axes.x.offset;ybar.scrollTop=axes.y.offset;
 host.dataset.panX=String(pan.x);host.dataset.panY=String(pan.y);
 };
 const schedule=()=>{if(!ticket&&!disposed)ticket=requestAnimationFrame(sync)};
 const geometry=()=>{dirty=true;schedule()};
 const scrollX=()=>{if(!axes||disposed||cy.destroyed())return;const next=-axes.x.min-xbar.scrollLeft;if(Math.abs(next-cy.pan().x)>.75)cy.pan({x:next,y:cy.pan().y})};
 const scrollY=()=>{if(!axes||disposed||cy.destroyed())return;const next=-axes.y.min-ybar.scrollTop;if(Math.abs(next-cy.pan().y)>.75)cy.pan({x:cy.pan().x,y:next})};
 xbar.addEventListener('scroll',scrollX,{passive:true});ybar.addEventListener('scroll',scrollY,{passive:true});
 cy.on('pan zoom',schedule);cy.on('add remove position resize',geometry);
 const observer=new ResizeObserver(()=>{if(!disposed&&!cy.destroyed()){cy.resize();geometry()}});observer.observe(host);
 cy.on('destroy',()=>{disposed=true;cancelAnimationFrame(ticket);observer.disconnect();xbar.removeEventListener('scroll',scrollX);ybar.removeEventListener('scroll',scrollY)});schedule();
}
