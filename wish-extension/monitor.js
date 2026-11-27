let replacing=null;
const $=id=>document.getElementById(id);
async function send(message) {
  const result=await chrome.runtime.sendMessage(message);
  if(!result?.ok) throw new Error(result?.error||'操作失败');
  return result;
}
async function render() {
  const {watchItems=[],observations=[]}=await chrome.storage.local.get(['watchItems','observations']);
  $('items').replaceChildren();
  for(const item of watchItems) {
    const article=document.createElement('article'), link=document.createElement('a');
    link.href=item.url;link.target='_blank';link.rel='noopener';link.textContent=item.lastResult?.title||`商品 ${item.itemId}`;article.append(link);
    const info=document.createElement('p'), result=item.lastResult;
    info.textContent=`目标价：${item.targetPrice?'¥'+item.targetPrice:'未设置'} · ${result?(result.ok?(['removed','sold'].includes(result.status)?(result.status==='sold'?'已售出':'已下架')+'，请更新同类商品链接':'最新 ¥'+result.price):result.error)+' · '+new Date(result.attemptedAt).toLocaleString():'等待首次检查'}`;article.append(info);
    if(['removed','sold'].includes(item.availability)){
      const warning=document.createElement('p');warning.textContent='该商品已不可购买。请换一件同型号、相近成色的商品继续观察。';article.append(warning);
      const replace=document.createElement('button');replace.textContent='更新同类链接';replace.onclick=()=>{replacing=item.itemId;$('url').value='';$('target').value=item.targetPrice||'';$('message').textContent='请粘贴新的同类商品链接后点击添加商品，旧商品历史保留，关联心愿将自动切换。';$('url').focus();};article.append(replace);
    }
    const history=document.createElement('ul');
    for(const row of observations.filter(row=>row.itemId===item.itemId).slice(-10).reverse()) {
      const li=document.createElement('li');li.textContent=`${new Date(row.observedAt).toLocaleString()} · ¥${row.price} · ${row.source==='scheduled-visible-page'?'自动读取，未经人工确认':'人工确认'}`;history.append(li);
    }
    article.append(history);
    if(result?.diagnostics){const details=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');summary.textContent='检查诊断（可复制给开发者）';pre.style.whiteSpace='pre-wrap';pre.textContent=JSON.stringify(result.diagnostics,null,2);details.append(summary,pre);article.append(details);}
    const remove=document.createElement('button');remove.textContent='停止并移除监测';remove.onclick=()=>action(async()=>{await send({type:'removeItem',itemId:item.itemId});await render();});article.append(remove);$('items').append(article);
  }
}
async function action(job) {try {await job();}catch(error){$('message').textContent=error.message;}}
$('settings').onsubmit=event=>{event.preventDefault();action(async()=>{await send({type:'saveSettings',settings:{time:$('time').value,enabled:$('enabled').checked}});$('message').textContent='每日检查设置已保存。';});};
$('add').onsubmit=event=>{event.preventDefault();action(async()=>{await send({type:'addItem',url:$('url').value,targetPrice:$('target').value,replaceItemId:replacing});replacing=null;$('message').textContent='已添加，可立即检查或等待每日任务。';await render();});};
$('run').onclick=()=>action(async()=>{ $('run').disabled=true;$('message').textContent='正在逐个检查，每件商品最多等待约 20 秒。';try{const result=await send({type:'runNow'});$('message').textContent=`本次成功 ${result.success} 件，失败 ${result.failed} 件。失败商品请展开检查诊断。`;await render();}finally{$('run').disabled=false;}});
$('export').onclick=()=>action(async()=>{const data=await chrome.storage.local.get(['watchItems','observations','settings']);const url=URL.createObjectURL(new Blob([JSON.stringify({schemaVersion:2,...data},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='wish-monitor.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
chrome.storage.onChanged.addListener(()=>action(render));
action(async()=>{const {settings={time:'18:00',enabled:true}}=await chrome.storage.local.get('settings');$('time').value=settings.time;$('enabled').checked=settings.enabled;await render();});
