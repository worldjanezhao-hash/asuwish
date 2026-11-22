const $=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY'}).format(n/100);
const cents=value=>Math.round(Number(value)*100);
let state={wish:null,entries:[],watchItems:[],observations:[]};
let writing=false;
async function mutate(job){if(writing)return;writing=true;try{await job();$('message').textContent='';await render();}catch(e){$('message').textContent=e.message;}finally{writing=false;}}
async function render(){
  const data=await chrome.storage.local.get(['wish','entries','watchItems','observations']);
  state={wish:null,entries:[],watchItems:[],observations:[],...data};
  const w=state.wish;if(!w)return;
  $('setup').hidden=true;$('dashboard').hidden=false;$('heading').textContent=w.name;
  const saved=state.entries.reduce((sum,e)=>sum+e.amount, w.initial),remaining=Math.max(0,w.goal-saved),ratio=Math.min(1,saved/w.goal);
  $('saved').textContent=money(saved);$('remaining').textContent=`目标 ${money(w.goal)} · 还差 ${money(remaining)}`;$('progress').value=ratio*100;
  const weeks=Math.ceil(remaining/w.weekly);const date=new Date();date.setDate(date.getDate()+weeks*7);
  $('estimate').textContent=remaining?`按每周 ${money(w.weekly)}，预计还需 ${weeks} 周（约 ${date.toLocaleDateString()}）。`:'已经攒够了！购买前再确认商品情况与总费用。';
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
$('wish-form').onsubmit=e=>{e.preventDefault();mutate(async()=>{const w={name:$('name').value.trim(),goal:cents($('goal').value),initial:cents($('initial').value),weekly:cents($('weekly').value)};if(!w.name||![w.goal,w.initial,w.weekly].every(Number.isSafeInteger)||w.goal<=0||w.weekly<=0||w.initial<0)throw Error('请填写有效金额和心愿名称');await chrome.storage.local.set({wish:w,entries:[]});});};
$('entry-form').onsubmit=e=>{e.preventDefault();mutate(async()=>{const {wish,entries=[]}=await chrome.storage.local.get(['wish','entries']);const amount=cents($('amount').value)*($('kind').value==='withdrawal'?-1:1);if(!Number.isSafeInteger(amount)||!amount)throw Error('金额无效');if(entries.reduce((n,r)=>n+r.amount,wish.initial)+amount<0)throw Error('取出金额不能超过已攒金额');entries.push({amount,note:$('note').value.trim(),at:new Date().toISOString()});await chrome.storage.local.set({entries});$('entry-form').reset();});};
$('product').onchange=()=>mutate(async()=>{const {wish}=await chrome.storage.local.get('wish');await chrome.storage.local.set({wish:{...wish,itemId:$('product').value}});});
$('backup').onclick=()=>mutate(async()=>{const data=await chrome.storage.local.get(null),url=URL.createObjectURL(new Blob([JSON.stringify({schemaVersion:3,...data},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='wish-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
chrome.storage.onChanged.addListener(()=>render().catch(e=>$('message').textContent=e.message));render().catch(e=>$('message').textContent=e.message);
