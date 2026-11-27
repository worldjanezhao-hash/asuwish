function updateWishes(data,message) {
 const wished=data.wish?{...data.wish,id:data.wish.id||'original',createdAt:data.wish.createdAt||new Date().toISOString()}:null;
 let wishes=[...(data.wishes||[])];
 if(wished){const i=wishes.findIndex(w=>w.id===wished.id);const snapshot={...wished,entries:data.entries||[]};if(i<0)wishes.push(snapshot);else wishes[i]=snapshot;}
 let active=wished;
 const validate=w=>{if(!w||!w.name?.trim()||w.name.length>100||![w.goal,w.initial,w.weekly].every(Number.isSafeInteger)||w.goal<=0||w.initial<0||w.weekly<=0)throw Error('请填写有效的名称和金额');};
 if(message.type==='createWish') {validate(message.wish);active={...message.wish,id:message.id,createdAt:new Date().toISOString(),entries:[]};wishes.push(active);}
 else if(message.type==='switchWish'){active=wishes.find(w=>w.id===message.id);if(!active)throw Error('找不到这个心愿');}
 else {
  if(!active)throw Error('请先创建心愿');
  if(message.type==='editWish'){const fields=message.fields;active={...active,name:fields.name,goal:fields.goal,weekly:fields.weekly};validate(active);}
  if(message.type==='completeWish'){
   if(active.completedAt)throw Error('这个心愿已经完成');
   if(!Number.isSafeInteger(message.spent)||message.spent<=0)throw Error('请填写实际花费');
   const balance=(data.entries||[]).reduce((n,r)=>n+r.amount,active.initial);
   if(message.spent>balance)throw Error('实际花费超过已攒金额，请先补记存入');
   const date=new Date(message.date+'T12:00:00');if(!Number.isFinite(date.getTime())||message.date>`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`)throw Error('请选择有效的购买日期');
   active={...active,completedAt:message.date,spent:message.spent,memory:String(message.memory||'').slice(0,500)};
  }
  if(message.type==='reopenWish'){const {completedAt,spent,memory,...rest}=active;active=rest;}
 }
 const index=wishes.findIndex(w=>w.id===active.id);if(index>=0)wishes[index]={...active,entries:active.entries||data.entries||[]};
 const entries=active.entries||data.entries||[];const {entries:ignored,...wish}=active;
 return {wish,entries,wishes};
}
