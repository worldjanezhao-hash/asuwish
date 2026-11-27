// Only configured website paths can use this bridge.
const allowed=new Set(['createWish','switchWish','editWish','completeWish','reopenWish','readState','writeWish','writeEntries','runNow','addItem','removeItem','saveSettings']);
window.addEventListener('message',async event=>{
  const m=event.data;
  if(event.source!==window||event.origin!==location.origin||m?.channel!=='wish-request'||!allowed.has(m.type))return;
  try{
    const response=await chrome.runtime.sendMessage(m);
    window.postMessage({channel:'wish-response',requestId:m.requestId,response},location.origin);
  }catch(error){window.postMessage({channel:'wish-response',requestId:m.requestId,response:{ok:false,error:error.message}},location.origin);}
});
chrome.storage.onChanged.addListener(()=>window.postMessage({channel:'wish-changed'},location.origin));
