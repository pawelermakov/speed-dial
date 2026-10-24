/** Insert next to a target without changing any other item's relative order. */
export function insertedOrder(ids: string[], source: string, target: string, after: boolean): string[] | null {
  if (source === target || !ids.includes(source) || !ids.includes(target)) return null;
  const next = ids.filter(id => id !== source);
  next.splice(next.indexOf(target) + Number(after), 0, source);
  return next.every((id, index) => id === ids[index]) ? null : next;
}

/** Choose the nearest tile when dropping in a grid gap or the trailing add slot. */
export function nearestInsertion(rows:Array<{id:string;left:number;right:number;top:number;bottom:number}>,x:number,y:number):{id:string;after:boolean}|null {
  if(rows.length&&y>Math.max(...rows.map(row=>row.bottom)))return{id:rows[rows.length-1]!.id,after:true};
  let nearest:typeof rows[number]|undefined,distance=Infinity;
  for(const row of rows){const dx=Math.max(row.left-x,0,x-row.right),dy=Math.max(row.top-y,0,y-row.bottom),next=dx*dx+dy*dy;if(next<distance){distance=next;nearest=row;}}
  return nearest?{id:nearest.id,after:y>nearest.bottom||(y>=nearest.top&&x>(nearest.left+nearest.right)/2)}:null;
}
