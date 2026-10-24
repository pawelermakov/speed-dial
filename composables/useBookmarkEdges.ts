import { watch, type Ref } from 'vue';

// Mask individual tiles so the native scrollbar and glass surfaces stay independent.
export function useBookmarkEdges(viewport:Ref<HTMLElement|undefined>){
  watch(viewport,(element,_,cleanup)=>{
    if(!element)return;
    let frame=0;
    const update=()=>{
      const top=Math.max(0,element.scrollTop),bottom=Math.max(0,element.scrollHeight-element.clientHeight-top);
      element.style.setProperty('--bookmark-scroll-offset',top+'px');
      element.style.setProperty('--bookmark-edge-top',Math.min(24,top)+'px');
      element.style.setProperty('--bookmark-edge-bottom',Math.min(24,bottom)+'px');
    };
    const measure=()=>{
      frame=0;
      element.style.setProperty('--bookmark-viewport-height',element.clientHeight+'px');
      const top=element.getBoundingClientRect().top+element.clientTop;
      for(const tile of element.querySelectorAll<HTMLElement>('.bookmarks>.bookmark,.bookmarks>.add-card,.bookmark-empty,.bookmark-search-empty,.surface-empty')){
        tile.dataset.bookmarkEdgeItem='';
        tile.style.setProperty('--bookmark-item-offset',(tile.getBoundingClientRect().top-top+element.scrollTop)+'px');
      }
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
