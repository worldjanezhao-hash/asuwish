importScripts('parser.js','wishes.js');
let queue = Promise.resolve();
const serial = job => { const result = queue.then(job); queue = result.catch(() => {}); return result; };
const day = date => `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`;
const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
async function saveObservation(row) {
  const {observations=[]} = await chrome.storage.local.get('observations');
  observations.push(row);
  await chrome.storage.local.set({observations});
}
async function check(item) {
  let tab, owned=false, result, injectionError;
  const attemptedAt = new Date().toISOString();
  try {
    const opened=await chrome.tabs.query({url:['https://www.goofish.com/item*','https://goofish.com/item*']});
    tab=opened.find(t=>{try{return new URL(t.url).searchParams.get('id')===item.itemId;}catch(_){return false;}});
    if(!tab){tab=await chrome.tabs.create({url:item.url,active:false});owned=true;}
    for (let attempt=0;attempt<8;attempt++) {
      await pause(2500);
      try {
        const [injection] = await chrome.scripting.executeScript({target:{tabId:tab.id},func:parseVisibleProduct});
        result = injection?.result;
        if (['removed','sold'].includes(result?.status) || (result?.scopeFound && result.title && Number(result.price)>0)) break;
      } catch (error) { injectionError=error.message; }
    }
    if(['removed','sold'].includes(result?.status)){
      if(item.availability!==result.status){
        await chrome.notifications.create({type:'basic',iconUrl:'icon.png',title:result.status==='sold'?'心愿商品已售出':'心愿商品已下架',message:'请打开网站更新同类商品链接，原有攒钱和价格历史会保留。'}).catch(()=>{});
      }
      return {attemptedAt,ok:true,status:result.status,title:result.title,diagnostics:result.diagnostics};
    }
    if (!result?.scopeFound || !result.title || !(Number(result.price)>0)) throw new Error(result?.diagnostics?.reason || injectionError || '页面尚未加载出可读取的商品信息');
    const {observations=[]} = await chrome.storage.local.get('observations');
    const previous = observations.filter(row => row.itemId===item.itemId).at(-1);
    const row = {...result,price:Number(result.price),status:'unknown',source:'scheduled-visible-page',confirmed:false};
    await saveObservation(row);
    const reached = item.targetPrice>0 && row.price<=item.targetPrice;
    const crossed = reached && (!previous || previous.price>item.targetPrice);
    const decreased = previous && row.price<previous.price;
    if (crossed || decreased) {
      await chrome.notifications.create({type:'basic',iconUrl:'icon.png',title:crossed?'心愿商品达到目标价':'心愿商品降价了',message:`${row.title.slice(0,60)}：¥${row.price}${previous?'，上次 ¥'+previous.price:''}`});
    }
    return {attemptedAt,ok:true,price:row.price,title:row.title};
  } catch(error) { return {attemptedAt,ok:false,error:error.message,diagnostics:result?.diagnostics||{injectionError},tabMode:owned?'新建后台页':'已有商品页'}; }
  finally { if (tab && owned) await chrome.tabs.remove(tab.id).catch(()=>{}); }
}
async function run(manual=false) {
  const {watchItems=[],settings={time:'18:00',enabled:true}} = await chrome.storage.local.get(['watchItems','settings']);
  if (!manual && !settings.enabled) return;
  const now = new Date(), today = day(now);
  const [hours,minutes] = settings.time.split(':').map(Number);
  const due = new Date(now); due.setHours(hours,minutes,0,0);
  let success=0, failed=0;
  for (const item of watchItems) {
    if (!item.enabled || (!manual && (now<due || item.lastAttemptDay===today))) continue;
    // Persist attempt before opening a tab, so worker interruption cannot create a retry loop.
    item.lastAttemptDay=today; item.lastResult={ok:false,error:'检查中或上次检查被浏览器中断',attemptedAt:new Date().toISOString()};
    await chrome.storage.local.set({watchItems});
    item.lastResult=await check(item);
    if(item.lastResult.ok)item.availability=item.lastResult.status||'available';
    if(item.lastResult.ok)success++;else failed++;
    await chrome.storage.local.set({watchItems});
  }
  return {success,failed};
}
async function initialize() {
  if (!await chrome.alarms.get('wish-daily')) await chrome.alarms.create('wish-daily',{periodInMinutes:1});
  await serial(()=>run());
}
chrome.runtime.onInstalled.addListener(initialize);
chrome.runtime.onStartup.addListener(initialize);
chrome.alarms.onAlarm.addListener(alarm => {if(alarm.name==='wish-daily') serial(()=>run());});
chrome.runtime.onMessage.addListener((message,sender,respond) => {
  if(sender.id!==chrome.runtime.id) return;
  serial(async()=>{
    const bridgeSender=sender.url?.startsWith('http://localhost:8765/') || sender.url?.startsWith('https://worldjanezhao-hash.github.io/asuwish/');
    if(sender.tab && !bridgeSender) throw new Error('不受支持的网站来源');
    if(message.type==='readState') {
      return {data:await chrome.storage.local.get(['wish','entries','wishes','watchItems','observations','settings'])};
    }
    if(['createWish','switchWish','editWish','completeWish','reopenWish'].includes(message.type)) {
      const data=await chrome.storage.local.get(['wish','entries','wishes']);
      const result=updateWishes(data,{...message,id:message.type==='createWish'?crypto.randomUUID():message.id});
      await chrome.storage.local.set(result);return {};
    }
    if(message.type==='writeWish') {
      const w=message.wish;
      if(!w || typeof w.name!=='string' || !w.name.trim() || w.name.length>100 || ![w.goal,w.initial,w.weekly].every(Number.isSafeInteger) || w.goal<=0 || w.initial<0 || w.weekly<=0) throw new Error('心愿参数无效');
      await chrome.storage.local.set({wish:w,...(message.initializeEntries?{entries:[]}:{})});return {};
    }
    if(message.type==='writeEntries') {
      const rows=message.entries;
      const current=await chrome.storage.local.get('wish');if(current.wish?.completedAt)throw Error('已完成的心愿不能继续记账，请先恢复');
      const {wish}=await chrome.storage.local.get('wish');
      if(!wish || !Array.isArray(rows) || rows.some(r=>!Number.isSafeInteger(r.amount)||!r.amount||typeof r.note!=='string'||r.note.length>150||!Number.isFinite(Date.parse(r.at))) || rows.reduce((sum,r)=>sum+r.amount,wish.initial)<0) throw new Error('储蓄记录无效');
      await chrome.storage.local.set({entries:rows});return {};
    }
    if(message.type==='runNow') {return await run(true);}
    if(message.type==='saveObservation') {await saveObservation(message.row); return {};}
    if(message.type==='saveSettings') {
      if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(message.settings.time)) throw new Error('时间无效');
      await chrome.storage.local.set({settings:message.settings}); return {};
    }
    const {watchItems=[]}=await chrome.storage.local.get('watchItems');
    if(message.type==='addItem') {
      const url=new URL(message.url);
      if(!['www.goofish.com','goofish.com'].includes(url.hostname)||url.protocol!=='https:'||url.pathname!=='/item'||!/^\d+$/.test(url.searchParams.get('id')||'')) throw new Error('请粘贴完整的闲鱼商品详情链接');
      const itemId=url.searchParams.get('id'), targetPrice=Number(message.targetPrice);
      if(message.replaceItemId===itemId)throw new Error('请提供另一件同类商品的链接');
      if(!Number.isFinite(targetPrice)||targetPrice<0) throw new Error('目标价无效');
      const item=watchItems.find(row=>row.itemId===itemId);
      if(item) {item.targetPrice=targetPrice;item.enabled=true;}
      else watchItems.push({itemId,url:`https://www.goofish.com/item?id=${itemId}`,targetPrice,enabled:true});
    } else if(message.type==='removeItem') {
      await chrome.storage.local.set({watchItems:watchItems.filter(row=>row.itemId!==message.itemId)}); return {};
    } else throw new Error('未知操作');
    if(message.type==='addItem'&&message.replaceItemId){
      const old=watchItems.find(x=>x.itemId===message.replaceItemId);if(old)old.enabled=false;
      const {wish,wishes=[]}=await chrome.storage.local.get(['wish','wishes']);
      const newId=new URL(message.url).searchParams.get('id');
      await chrome.storage.local.set({...(wish?.itemId===message.replaceItemId?{wish:{...wish,itemId:newId}}:{}),wishes:wishes.map(w=>w.itemId===message.replaceItemId?{...w,itemId:newId}:w)});
    }
    await chrome.storage.local.set({watchItems}); return {};
  }).then(result=>respond({ok:true,...result}),error=>respond({ok:false,error:error.message}));
  return true;
});
