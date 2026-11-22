const CAP=8000, UNIT=250;
function predict(s){
 return s.people.map(n=>Array.from({length:6},(_,k)=>{
  const h=s.hour+k,w=MODEL.weights;
  return n*(w[0]+w[1]*Math.exp(-(((h-8)/2.2)**2))+w[2]*Math.exp(-(((h-19)/2.8)**2))+w[3]*(s.temp-28));
 }));
}
function solve(s, confirmed={}){
 const hourly=predict(s), count=Math.floor(s.load/UNIT);
 const options=hourly.map((hs,i)=>{
  const total=hs.reduce((a,b)=>a+b,0), early=hs.slice(0,s.delay).reduce((a,b)=>a+b,0);
  const band=s.error[i], stocks=i in confirmed?[confirmed[i]]:[-band,0,band].map(delta=>Math.min(CAP,Math.max(0,s.stock[i]+delta)));
  return Array.from({length:count+1},(_,q)=>{
   let loss=0;
   for(const stock of stocks){
    const remaining=Math.max(0,stock-early);
    if(remaining+q*UNIT>CAP+1e-8)return Infinity;
    loss+=(Math.max(0,early-stock)+Math.max(0,total-early-remaining-q*UNIT))/stocks.length;
   }return loss;
  });
 });
 let best,loss=Infinity,fair=Infinity,used=-1;
 const totals=hourly.map(h=>h.reduce((a,b)=>a+b,0));
 for(let a=0;a<=count;a++)for(let b=0;b<=count-a;b++){
  // Extra water never increases shortage. Use the largest feasible last drop.
  let c=count-a-b;
  while(c>0&&!Number.isFinite(options[2][c]))c--;
  const split=[a,b,c], gaps=split.map((q,i)=>options[i][q]);
  const sum=gaps.reduce((x,y)=>x+y), worst=Math.max(...gaps.map((v,i)=>v/totals[i]));
  if(!Number.isFinite(sum))continue;
  if(sum<loss-1e-7 || (Math.abs(sum-loss)<1e-7 && (worst<fair-1e-8 || (Math.abs(worst-fair)<1e-8 && a+b+c>used)))){
   best=split;loss=sum;fair=worst;used=a+b+c;
  }
 }
 const equal=[0,0,0];let left=count;
 while(left){let changed=false;for(let i=0;i<3&&left;i++)if(Number.isFinite(options[i][equal[i]+1])){equal[i]++;left--;changed=true;}if(!changed)break;}
 return {best:best.map(q=>q*UNIT),loss,gaps:best.map((q,i)=>options[i][q]),baseline:equal.reduce((n,q,i)=>n+options[i][q],0),hourly,totals,unused:(count-used)*UNIT};
}
function readingValues(s,p){
 return s.error.map((band,i)=>{
  if(!band)return 0;
  const after=[-band,0,band].map(v=>solve(s,{[i]:Math.max(0,Math.min(CAP,s.stock[i]+v))}).loss);
  return Math.max(0,p.loss-after.reduce((a,b)=>a+b)/3);
 });
}
