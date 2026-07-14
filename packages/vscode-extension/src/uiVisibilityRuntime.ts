export function webviewVisibilityRuntime(
  prefix: '__kp' | '__kpClaude',
  endpointVariable: string,
  tokenVariable: string
): string {
  const isVisible = `${prefix}ElementIsVisible`;
  const heartbeat = `${prefix}VisibilityHeartbeat`;
  const observe = `${prefix}ObserveVisibility`;

  for (const identifier of [endpointVariable, tokenVariable]) {
    if (!/^__[A-Za-z0-9_$]+$/.test(identifier)) {
      throw new Error('Некорректный идентификатор runtime видимости Kodpauza.');
    }
  }

  return `function ${isVisible}(e){if(!e||!e.isConnected||document.visibilityState!=="visible"||e.closest('[hidden],[aria-hidden="true"],[inert]'))return!1;let t=e.getBoundingClientRect(),n=window.innerWidth||document.documentElement.clientWidth,r=window.innerHeight||document.documentElement.clientHeight;if(n<=0||r<=0||t.width<24||t.height<8||t.right<=0||t.bottom<=0||t.left>=n||t.top>=r)return!1;let i=Math.max(0,Math.min(t.right,n)-Math.max(t.left,0)),o=Math.max(0,Math.min(t.bottom,r)-Math.max(t.top,0));if(i*o/(t.width*t.height)<.8)return!1;for(let t=e;t&&t!==document.documentElement;t=t.parentElement){let e=getComputedStyle(t);if(e.display==="none"||e.visibility!=="visible"||e.contentVisibility==="hidden"||Number(e.opacity)<.1)return!1}let a=Math.max(0,Math.min(n-1,t.left+t.width/2)),s=Math.max(0,Math.min(r-1,t.top+t.height/2)),l=document.elementFromPoint(a,s);return l===e||e.contains(l)}function ${heartbeat}(e,t,n){fetch(${endpointVariable}+"/visibility?token="+encodeURIComponent(${tokenVariable}),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({adId:e.adId,viewId:t,visible:n}),cache:"no-store"}).catch(()=>{})}function ${observe}(e,t){if(!e||!t)return;let n=!0,r,i=!1,o,a=globalThis.crypto?.randomUUID?.()??Math.random().toString(36).slice(2)+Date.now().toString(36),s=()=>{r!=null&&clearTimeout(r),n&&(r=setTimeout(l,i?700:250))},l=()=>{if(!n)return;let r=${isVisible}(e);r?${heartbeat}(t,a,!0):i&&${heartbeat}(t,a,!1),i=r,s()},c=()=>l();return typeof IntersectionObserver==="function"&&((o=new IntersectionObserver(c,{threshold:[0,.8,1]})).observe(e)),document.addEventListener("visibilitychange",c),window.addEventListener("resize",c),l(),()=>{n=!1,r!=null&&clearTimeout(r),i&&${heartbeat}(t,a,!1),o&&o.disconnect(),document.removeEventListener("visibilitychange",c),window.removeEventListener("resize",c)}}`;
}
