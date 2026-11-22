const $ = id => document.getElementById(id);
let current;
async function history() {
  const {observations=[]} = await chrome.storage.local.get('observations');
  $('history').replaceChildren();
  if (!current) return;
  const rows = observations.filter(r => r.itemId === current.itemId).sort((a,b) => b.observedAt.localeCompare(a.observedAt));
  for (const row of rows.slice(0,12)) {
    const li = document.createElement('li');
    li.textContent = `${new Date(row.observedAt).toLocaleString()} · ¥${row.price} · ${row.status}`;
    $('history').append(li);
  }
  return rows;
}
$('read').onclick = async () => {
  $('form').hidden = true; current = null;
  try {
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    const [result] = await chrome.scripting.executeScript({target:{tabId:tab.id},func:parseVisibleProduct});
    if (!result?.result) throw new Error('未能读取页面，请等待商品详情加载后重试。');
    current = result.result;
    for (const key of ['title','price','condition']) $(key).value = current[key];
    $('status').value = 'unknown'; $('form').hidden = false;
    $('message').textContent = current.price ? '已读取候选信息，请核对后保存。' : `未定位唯一售价，请查看页面填写。${current.priceCandidates.length ? ' 候选：'+current.priceCandidates.join('、') : ''}`;
    await history();
  } catch(error) { $('message').textContent = error.message; }
};
$('form').onsubmit = async event => {
  event.preventDefault();
  if (!current) return;
  try {
    const row = {...current,title:$('title').value.trim(),price:Number($('price').value),condition:$('condition').value.trim(),status:$('status').value,confirmedAt:new Date().toISOString(),source:'user-confirmed-visible-page'};
    if (!row.title || !Number.isFinite(row.price) || row.price <= 0) throw new Error('请填写标题和有效价格。');
    const result = await chrome.runtime.sendMessage({type:'saveObservation',row});
    if (!result.ok) throw new Error(result.error);
    $('message').textContent = '价格快照已保存。';
    await history();
  } catch(error) { $('message').textContent = error.message; }
};
$('export').onclick = async () => {
  const {observations=[]} = await chrome.storage.local.get('observations');
  const url = URL.createObjectURL(new Blob([JSON.stringify({schemaVersion:1,observations},null,2)],{type:'application/json'}));
  const a = document.createElement('a'); a.href=url; a.download='wish-price-observations.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
};

$('monitor').onclick = () => chrome.runtime.openOptionsPage();

$('home').onclick = () => chrome.tabs.create({url:chrome.runtime.getURL('home.html')});
