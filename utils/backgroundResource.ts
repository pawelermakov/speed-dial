export class BackgroundResource {
  private generation=0;
  private url='';
  private bytes:Uint8Array|undefined;
  private type='';
  constructor(private publish:(url:string)=>Promise<void>,private preload:(url:string)=>Promise<void>,
    private create=(blob:Blob)=>URL.createObjectURL(blob),private revoke=(url:string)=>URL.revokeObjectURL(url)) {}
  async replace(blob:Blob|null) {
    const current=++this.generation;
    const bytes=blob?new Uint8Array(await blob.arrayBuffer()):undefined;
    if(current!==this.generation)return;
    if(blob && this.bytes && blob.type===this.type && bytes!.length===this.bytes.length && bytes!.every((value,i)=>value===this.bytes![i]))return;
    if(!blob && !this.url)return;
    const next=blob?this.create(blob):'';
    try { if(next)await this.preload(next); }
    catch(error){if(next)this.revoke(next);if(current===this.generation)throw error;return;}
    if(current!==this.generation){if(next)this.revoke(next);return;}
    const previous=this.url;
    this.url=next;this.bytes=bytes;this.type=blob?.type??'';
    await this.publish(next);
    if(previous)this.revoke(previous);
  }
  dispose(){this.generation++;if(this.url)this.revoke(this.url);this.url='';this.bytes=undefined;}
}
