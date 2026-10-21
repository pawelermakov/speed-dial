/** Insert next to a target without changing any other item's relative order. */
export function insertedOrder(ids: string[], source: string, target: string, after: boolean): string[] | null {
  if (source === target || !ids.includes(source) || !ids.includes(target)) return null;
  const next = ids.filter(id => id !== source);
  next.splice(next.indexOf(target) + Number(after), 0, source);
  return next.every((id, index) => id === ids[index]) ? null : next;
}
