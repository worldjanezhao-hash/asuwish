function parseVisibleProduct() {
  const url = new URL(location.href);
  if (!['www.goofish.com', 'goofish.com'].includes(url.hostname) || url.pathname !== '/item' || !url.searchParams.get('id')) throw new Error('请先打开闲鱼商品详情页。');
  const visible = el => {
    const style = getComputedStyle(el), rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  };
  // Anchor extraction to the detail panel containing the purchase action.
  const nodes = [...document.querySelectorAll('body *')].filter(el => visible(el) && !['SCRIPT','STYLE'].includes(el.tagName));
  const buy = nodes.find(el => /^(立即购买|立即购买宝贝)$/.test(el.innerText?.trim()) && ![...el.children].some(child => /^(立即购买|立即购买宝贝)$/.test(child.innerText?.trim())));
  const unavailable = nodes.find(el => /^(已下架|宝贝已下架|商品已下架|已售出|宝贝已售出|商品已售出)$/.test(el.innerText?.trim()) && ![...el.children].some(child => /^(已下架|宝贝已下架|商品已下架|已售出|宝贝已售出|商品已售出)$/.test(child.innerText?.trim())) && (()=>{for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement){if(p.innerText.length>15000)return false;if(/[¥￥]/.test(p.innerText))return true;}return false;})());
  const status=!buy&&unavailable?(/售出/.test(unavailable.innerText)?'sold':'removed'):'unknown';
  if(status!=='unknown')return {itemId:url.searchParams.get('id'),status,title:document.title.replace(/\s*[-_|]\s*闲鱼.*$/,''),observedAt:new Date().toISOString(),diagnostics:{reason:unavailable.innerText.trim()}};
  let scope = null;
  for (let el = buy?.parentElement; el && el !== document.body; el = el.parentElement) {
    const t = el.innerText;
    if (/[¥￥]/.test(t) && t.length < 15000) { scope = el; break; }
  }
  const diagnostics = {pageTitle:document.title,readyState:document.readyState,visibility:document.visibilityState,buyFound:Boolean(buy),scopeFound:Boolean(scope)};
  const clean = value => value.replace(/\s+/g, ' ').trim();
  const tabTitle = clean(document.title).replace(/\s*[-_|]\s*闲鱼.*$/, '').replace(/[,，]$/, '');
  const title = /闲不住|^闲鱼$/.test(tabTitle) ? '' : tabTitle;
  const text = scope?.innerText || '';
  // Whitespace allows currency and digits split into separate DOM nodes/lines.
  const prices = [...text.matchAll(/[¥￥]\s*(\d+(?:\.\d{1,2})?)/g)].map(m => m[1]);
  const unique = [...new Set(prices)];
  let price = unique.length === 1 ? unique[0] : '';
  if (scope && unique.length > 1) {
    // Prefer a short price container in the detail panel, excluding crossed-out prices.
    const priceNodes = [...scope.querySelectorAll('[class*="price"], [class*="Price"]')].filter(el => visible(el) && !/原价|划线价|到手价|起拍/.test(el.innerText) && !/line-through/.test(getComputedStyle(el).textDecorationLine));
    const matches = priceNodes.map(el => clean(el.innerText).match(/^[¥￥]\s*(\d+(?:\.\d{1,2})?)(?:\s*(?:包邮|不包邮))?$/)).filter(Boolean);
    const specific = [...new Set(matches.map(m => m[1]))];
    if (specific.length === 1) price = specific[0];
  }
  const condition = text.match(/(?:成色|新旧程度)\s*[:：]?\s*(全新|几乎全新|准新|未拆封|仅拆封|轻微使用痕迹|明显使用痕迹|\d{1,3}成新|\d{1,3}新)/)?.[1] || '';
  return {itemId:url.searchParams.get('id'),url:`https://www.goofish.com/item?id=${encodeURIComponent(url.searchParams.get('id'))}`,title,price,condition,observedAt:new Date().toISOString(),priceCandidates:unique.slice(0,10),parserVersion:3,scopeFound:Boolean(scope),diagnostics:{...diagnostics,priceCandidates:unique.slice(0,10),reason:!buy?'未找到主商品购买按钮':!scope?'购买区域未包含价格':!price?'商品区域价格缺失或存在多个候选':!title?'商品标题尚未加载':'已解析'}};
}
