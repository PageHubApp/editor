/** Inline head script: hides every `[data-dismiss]` whose key is stored, before first paint. Emit it with the page's nonce. */
export const DISMISS_SNIPPET =
  '(function(){try{var s="",i,k;for(i=0;i<localStorage.length;i++){k=localStorage.key(i);if(k&&k.indexOf("ph-dismiss:")==0)s+=\'[data-dismiss="\'+k.slice(11).replace(/["\\\\]/g,"\\\\$&")+\'"]{display:none!important}\'}if(s){var e=document.createElement("style");e.setAttribute("nonce",(document.currentScript&&document.currentScript.nonce)||"");e.textContent=s;document.head.appendChild(e)}}catch(e){}})()';
export const DISMISS_PREFIX = "ph-dismiss:";
