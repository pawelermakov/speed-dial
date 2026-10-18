import type { Settings } from '../types/models';
export function luminance(hex:string):number {
  const channels=[1,3,5].map(index=>parseInt(hex.slice(index,index+2),16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
  return .2126*channels[0]!+.7152*channels[1]!+.0722*channels[2]!;
}
export function accentContrast(hex:string):'#000000'|'#FFFFFF' {
  const value=luminance(hex);
  return (value+.05)/.05>=1.05/(value+.05)?'#000000':'#FFFFFF';
}
export function appearanceTokens(settings:Settings) {
  const alpha=1-settings.uiTransparency/100;
  const channels=[1,3,5].map(index=>parseInt(settings.uiAccent.slice(index,index+2),16));
  const composite=(base:number)=>'#'+channels.map(value=>Math.round(alpha*value+(1-alpha)*base).toString(16).padStart(2,'0')).join('');
  const contrast=(a:string,b:string)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  const ink=accentContrast(settings.uiAccent);
  const categoryUnderlay=Math.min(contrast(ink,composite(0)),contrast(ink,composite(255)))>=4.5?'transparent':settings.uiAccent;
  const minButton=(text:string)=>Math.min(contrast(text,composite(255*alpha)),contrast(text,composite(255)));
  const buttonInk=ink;
  return {
    '--ui-radius':settings.uiRadius+'px',
    '--ui-surface-alpha':String(alpha),
    '--ui-blur':settings.uiBlur?'blur(10px)':'none',
    '--ui-accent':settings.uiAccent,
    '--ui-accent-rgb':[1,3,5].map(index=>parseInt(settings.uiAccent.slice(index,index+2),16)).join(' '),
    '--ui-accent-contrast':ink,
    '--ui-category-underlay':categoryUnderlay,
    '--ui-button-contrast':buttonInk,
    '--ui-button-underlay':minButton(buttonInk)>=4.5?'transparent':settings.uiAccent,
  };
}
