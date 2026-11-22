const listeners=[];
let nextId=0;
const pending=new Map();
window.addEventListener('message',event=>{
 if(event.source!==window||event.origin!==location.origin)return;
 const m=event.data;
 if(m?.channel==='wish-changed')listeners.forEach(f=>f());
 if(m?.channel!=='wish-response')return;
 const job=pending.get(m.requestId);if(!job)return;
 clearTimeout(job.timeout);pending.delete(m.requestId);
 m.response?.ok?job.resolve(m.response):job.reject(Error(m.response?.error||'扩展连接失败'));
});
function request(message){return new Promise((resolve,reject)=>{const requestId=++nextId;const timeout=setTimeout(()=>{pending.delete(requestId);reject(Error('未连接价格扩展，请在扩展管理页重新加载扩展，然后刷新本网站。'));},message.type==='runNow'?180000:5000);pending.set(requestId,{resolve,reject,timeout});window.postMessage({...message,requestId,channel:'wish-request'},location.origin);});}
// Shared data stays in the extension, so the website and collector never fork records.
window.chrome={storage:{local:{get:async()=> (await request({type:'readState'})).data,set:async data=>{
 if('wish'in data)await request({type:'writeWish',wish:data.wish,initializeEntries:'entries'in data});
 else if('entries'in data)await request({type:'writeEntries',entries:data.entries});
}},onChanged:{addListener:f=>listeners.push(f)}},runtime:{sendMessage:request}};
