const $=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY'}).format(n/100);
const cents=value=>Math.round(Number(value)*100);
let state={wish:null,entries:[],watchItems:[],observations:[]};
let writing=false;
async function send(message){const result=await chrome.runtime.sendMessage(message);if(!result.ok)throw Error(result.error);}
const localDay=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
async function mutate(job){if(writing)return;writing=true;try{await job();$('message').textContent='';await render();}catch(e){$('message').textContent=e.message;}finally{writing=false;}}
async function render(){
  const data=await chrome.storage.local.get(['wish','entries','wishes','watchItems','observations']);
  state={wish:null,entries:[],watchItems:[],observations:[],...data};
  const w=state.wish;
  $('wish-switch').replaceChildren();
  const list=[...(data.wishes||[])];if(w&&!list.some(x=>x.id===(w.id||'original')))list.push({...w,id:w.id||'original'});
  for(const item of list)$('wish-switch').add(new Option(`${item.completedAt?'已完成 · ':''}${item.name}`,item.id));
  $('wish-switch').value=w?.id||'original';$('edit-wish').disabled=!w;
  if(!w)return;
  if(!$('setup').dataset.creating)$('setup').hidden=true;$('dashboard').hidden=false;$('heading').textContent=w.name;
  const saved=state.entries.reduce((sum,e)=>sum+e.amount, w.initial),remaining=Math.max(0,w.goal-saved),ratio=Math.min(1,saved/w.goal);
  $('saved').textContent=money(saved);$('remaining').textContent=`目标 ${money(w.goal)} · 还差 ${money(remaining)}`;$('progress').value=ratio*100;
  const weeks=Math.ceil(remaining/w.weekly);const date=new Date();date.setDate(date.getDate()+weeks*7);
  $('estimate').textContent=remaining?`按每周 ${money(w.weekly)}，预计还需 ${weeks} 周（约 ${date.toLocaleDateString()}）。`:'已经攒够了！购买前再确认商品情况与总费用。';
  const today=localDay(new Date()),deposits=state.entries.filter(e=>e.amount>0),days=new Set(deposits.map(e=>localDay(new Date(e.at)))),todayAmount=deposits.filter(e=>localDay(new Date(e.at))===today).reduce((n,e)=>n+e.amount,0);
  $('daily').textContent=`今天存入 ${money(todayAmount)} · 累计攒钱 ${days.size} 天${todayAmount?' · 今天又向心愿走近了一点':' · 今天也可以从一小笔开始'}`;
  $('entry-form').hidden=Boolean(w.completedAt);$('complete-form').hidden=Boolean(w.completedAt);$('reopen').hidden=!w.completedAt;$('completed').hidden=!w.completedAt;
  if(w.completedAt){$('completed').replaceChildren();const h=document.createElement('h2');h.textContent='心愿已实现';const p=document.createElement('p');p.textContent=`${w.completedAt} · 实际花费 ${money(w.spent)} · 留存 ${money(saved-w.spent)}`;const note=document.createElement('p');note.textContent=w.memory||'把这一天，留给未来的自己。';$('completed').append(h,p,note);}
  $('stage').textContent=ratio>=1?'心愿准备出发':ratio>=.7?'风景越来越清晰':ratio>=.3?'属于你的风景正在展开':'从第一笔，开始靠近';
  document.documentElement.style.setProperty('--camera',.3+ratio*.7);document.documentElement.style.setProperty('--land',ratio);document.documentElement.style.setProperty('--sun',.4+ratio*.6);document.documentElement.style.setProperty('--flowers',Math.max(0,(ratio-.5)*2));
  $('product').replaceChildren(new Option('选择已添加的监测商品',''));
  for(const item of state.watchItems)$('product').add(new Option(item.lastResult?.title||`商品 ${item.itemId}`,item.itemId));
  $('product').value=w.itemId||'';prices(saved);
  $('ledger').replaceChildren();
  for(const row of [...state.entries].reverse()){const li=document.createElement('li');li.textContent=`${new Date(row.at).toLocaleString()} · ${row.amount>=0?'存入':'取出'} ${money(Math.abs(row.amount))}${row.note?' · '+row.note:''}`;$('ledger').append(li);}
}
function prices(saved){
 const id=state.wish.itemId,rows=state.observations.filter(r=>r.itemId===id&&Number.isFinite(r.price)&&r.price>0).sort((a,b)=>a.observedAt.localeCompare(b.observedAt));
 $('chart').replaceChildren();$('product-link').hidden=true;
 if(!rows.length){$('price-summary').textContent='尚无该商品的价格记录。添加商品并完成一次检查后即可查看。';$('advice').textContent='';return;}
 const latest=rows.at(-1),values=rows.map(r=>r.price),low=Math.min(...values),high=Math.max(...values);
 $('price-summary').textContent=`最近记录 ¥${latest.price} · ${new Date(latest.observedAt).toLocaleString()} · 共 ${rows.length} 次记录 · ${latest.confirmed===false?'自动读取待核对':'人工确认'}`;
 const svgNS='http://www.w3.org/2000/svg';const points=values.map((v,i)=>[30+(values.length===1?.5:i/(values.length-1))*660,165-(v-low)/(high-low||1)*130]);
 const line=document.createElementNS(svgNS,'polyline');line.setAttribute('points',points.map(p=>p.join(',')).join(' '));line.setAttribute('fill','none');line.setAttribute('stroke','#246c89');line.setAttribute('stroke-width','3');$('chart').append(line);
 for(const [x,y]of points){const circle=document.createElementNS(svgNS,'circle');circle.setAttribute('cx',x);circle.setAttribute('cy',y);circle.setAttribute('r','4');circle.setAttribute('fill','#246c89');$('chart').append(circle);}
 $('chart').setAttribute('aria-label',`挂牌价历史，最低 ${low} 元，最高 ${high} 元，共 ${rows.length} 次记录`);
 const stale=Date.now()-new Date(latest.observedAt).getTime()>86400000;
 $('advice').textContent=stale?'价格记录已超过一天，请先更新价格。':cents(latest.price)>saved?`距这次记录的挂牌价还差 ${money(cents(latest.price)-saved)}，运费和配件费另计。`:rows.length<3?'现有金额已覆盖挂牌价。价格记录不足，暂不判断购买时机，请确认运费、成色与配件。':`现有金额已覆盖挂牌价；${latest.price===low?'当前为这件商品已记录的最低挂牌价':'当前高于这件商品已记录的最低挂牌价 ¥'+low}。这不代表同型号市场最低价，购买前请重新核实。`;
 $('product-link').href=`https://www.goofish.com/item?id=${encodeURIComponent(id)}`;$('product-link').hidden=false;
}
$('wish-form').onsubmit=e=>{e.preventDefault();mutate(async()=>{const w={name:$('name').value.trim(),goal:cents($('goal').value),initial:cents($('initial').value),weekly:cents($('weekly').value)};await send({type:'createWish',wish:w});delete $('setup').dataset.creating;$('setup').hidden=true;$('wish-form').reset();});};
$('entry-form').onsubmit=e=>{e.preventDefault();mutate(async()=>{const {wish,entries=[]}=await chrome.storage.local.get(['wish','entries']);const amount=cents($('amount').value)*($('kind').value==='withdrawal'?-1:1);if(!Number.isSafeInteger(amount)||!amount)throw Error('金额无效');if(entries.reduce((n,r)=>n+r.amount,wish.initial)+amount<0)throw Error('取出金额不能超过已攒金额');entries.push({amount,note:$('note').value.trim(),at:new Date().toISOString()});await chrome.storage.local.set({entries});$('entry-form').reset();$('camera').animate([{transform:'translate(-50%,-25%) scale(1)'},{transform:'translate(-50%,-25%) scale(1.12)'},{transform:'translate(-50%,-25%) scale(1)'}],{duration:600});});};
$('product').onchange=()=>mutate(async()=>{const {wish}=await chrome.storage.local.get('wish');await chrome.storage.local.set({wish:{...wish,itemId:$('product').value}});});
$('backup').onclick=()=>mutate(async()=>{const data=await chrome.storage.local.get(null),url=URL.createObjectURL(new Blob([JSON.stringify({schemaVersion:3,...data},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='wish-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
chrome.storage.onChanged.addListener(()=>render().catch(e=>$('message').textContent=e.message));render().catch(e=>$('message').textContent=e.message);

$('new-wish').onclick=()=>{$('setup').dataset.creating='1';$('setup').hidden=false;$('setup').scrollIntoView({behavior:'smooth'});};
$('cancel-new').onclick=()=>{delete $('setup').dataset.creating;if(state.wish)$('setup').hidden=true;};
$('wish-switch').onchange=()=>mutate(()=>send({type:'switchWish',id:$('wish-switch').value}));
$('edit-wish').onclick=()=>{const w=state.wish;$('edit-name').value=w.name;$('edit-goal').value=w.goal/100;$('edit-weekly').value=w.weekly/100;$('edit-dialog').showModal();};
$('cancel-edit').onclick=()=>$('edit-dialog').close();
$('edit-form').onsubmit=e=>{e.preventDefault();mutate(async()=>{await send({type:'editWish',fields:{name:$('edit-name').value.trim(),goal:cents($('edit-goal').value),weekly:cents($('edit-weekly').value)}});$('edit-dialog').close();});};
$('purchase-date').value=localDay(new Date());$('purchase-date').max=localDay(new Date());
$('complete-form').onsubmit=e=>{e.preventDefault();mutate(()=>send({type:'completeWish',spent:cents($('spent').value),date:$('purchase-date').value,memory:$('memory').value}));};
$('reopen').onclick=()=>mutate(()=>send({type:'reopenWish'}));
