// Browser rendering is injected at application startup; domain/controller tests
// may import feature modules under Node without initializing a DOM renderer.
let renderer;
export function registerRegionRenderer(value){renderer=value}
function required(){if(!renderer)throw Error('React renderer has not been initialized');return renderer}
export const renderRegion=(...args)=>required().renderRegion(...args);
export const replaceRegion=(...args)=>required().replaceRegion(...args);
export const insertRegion=(...args)=>required().insertRegion(...args);
