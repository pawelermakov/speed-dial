import { watch, type Ref } from 'vue';

// Mask individual tiles so the native scrollbar and glass surfaces stay independent.
export function useBookmarkEdges(viewport:Ref<HTMLElement|undefined>){
  watch(viewport,(element,_,cleanup)=>{
    if(!element)return;
    let frame=0;
    let tiles:Array<{element:HTMLElement;top:number;bottom:number}>=[];
    let masked=new Set<HTMLElement>();
    const update=()=>{
      const top=Math.max(0,element.scrollTop),height=element.clientHeight,bottom=Math.max(0,element.scrollHeight-height-top);
      const edgeTop=Math.min(24,top)+'px',edgeBottom=Math.min(24,bottom)+'px';
      element.style.setProperty('--bookmark-edge-top',edgeTop);
      element.style.setProperty('--bookmark-edge-bottom',edgeBottom);
      const visible=tiles.filter(tile=>tile.bottom>=top-24&&tile.top<=top+height+24);
      const next=new Set(visible.map(tile=>tile.element));
      for(const tile of masked)if(!next.has(tile))tile.removeAttribute('data-bookmark-edge-active');
      // Only visible tiles need masks. Updating an inherited scroll offset used
      // to invalidate and repaint masks for every tile in a large folder.
      for(const tile of visible){
        tile.element.dataset.bookmarkEdgeActive='';
        tile.element.style.setProperty('--bookmark-mask-offset',(top-tile.top)+'px');
        tile.element.style.setProperty('--bookmark-mask-height',height+'px');
        tile.element.style.setProperty('--bookmark-mask-top',edgeTop);
        tile.element.style.setProperty('--bookmark-mask-bottom',edgeBottom);
      }
      masked=next;
    };
    const measure=()=>{
      frame=0;
      const scroll=element.scrollTop;
      const top=element.getBoundingClientRect().top+element.clientTop;
      // Read all geometry before writing styles: alternating these operations
      // forces a fresh layout for every tile in large folders.
      tiles=Array.from(element.querySelectorAll<HTMLElement>('.bookmarks>.bookmark,.bookmarks>.add-card,.bookmark-empty,.bookmark-search-empty,.surface-empty'),tile=>{
        const rect=tile.getBoundingClientRect();
        return {element:tile,top:rect.top-top+scroll,bottom:rect.bottom-top+scroll};
      });
      for(const tile of tiles)tile.element.dataset.bookmarkEdgeItem='';
      update();
    };
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure);};
    const resize=new ResizeObserver(schedule);
    const observe=()=>{resize.disconnect();resize.observe(element);for(const child of element.children)resize.observe(child);schedule();};
    const changes=new MutationObserver(observe);
    changes.observe(element,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    element.addEventListener('scroll',update,{passive:true});
    observe();
    cleanup(()=>{cancelAnimationFrame(frame);resize.disconnect();changes.disconnect();element.removeEventListener('scroll',update);});
  },{flush:'post'});
}
