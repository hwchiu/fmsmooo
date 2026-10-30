/** Stable data boundary for the future Go snapshot service. */
export interface SnapshotRepository { loadSnapshot():Promise<unknown>; loadSchema():Promise<unknown> }
export class JsonSnapshotRepository implements SnapshotRepository {
 async loadSnapshot(){return this.load('/data/factories.json')}
 async loadSchema(){return this.load('/data/schema.json')}
 private async load(url:string){const response=await fetch(url);if(!response.ok)throw new Error(`Snapshot request failed: ${response.status}`);return response.json()}
}
export const snapshotRepository:SnapshotRepository=new JsonSnapshotRepository();
