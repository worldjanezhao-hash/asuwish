// Only the local website can use this bridge; the manifest fixes its origin.
const allowed=new Set(['readState','writeWish','writeEntries','runNow','addItem','removeItem','saveSettings']);
window.addEventListener('message',async event=>{
  const m=event.data;
  if(event.source!==window||event.origin!==location.origin||m?.channel!=='wish-request'||!allowed.has(m.type))return;
  try{
    const response=await chrome.runtime.sendMessage(m);
    window.postMessage({channel:'wish-response',requestId:m.requestId,response},location.origin);
  }catch(error){window.postMessage({channel:'wish-response',requestId:m.requestId,response:{ok:false,error:error.message}},location.origin);}
});
chrome.storage.onChanged.addListener(()=>window.postMessage({channel:'wish-changed'},location.origin));
