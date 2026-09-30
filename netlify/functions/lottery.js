// netlify/functions/lottery.js — 🎰 抓財政部賦稅署官方中獎號碼（代理，解決瀏覽器 CORS）
// App 呼叫：GET /.netlify/functions/lottery?keys=2026-07~08,latest
const LIST_URL='https://www.dot.gov.tw/multiplehtml/ch26';

async function fetchText(url){
  const res=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (compatible; PiaojiApp/1.0)'},signal:AbortSignal.timeout(20000)});
  if(!res.ok) throw new Error('HTTP '+res.status+' from '+url);
  return await res.text();
}

// ROC year (民國) → Gregorian
const greg=(roc,mm,dd)=>`${+roc+1911}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;

async function parsePeriod(url){
  const d=await fetchText('https://www.dot.gov.tw'+url);
  const special=(d.match(/特別獎[^。]*?「(\d{8})」/)||[])[1]||null;
  const grand=(d.match(/特獎獎金[^。]*?「(\d{8})」/)||[])[1]||null;
  const block=d.match(/頭獎獎金[^。]*?((?:「\d{8}」)(?:、「\d{8}」)+)/); // 貪心：吃進全部 3 組
  const first=block?[...block[1].matchAll(/\d{8}/g)].map(m=>m[0]):[];
  return {special,grand,first};
}

exports.handler=async (req,res)=>{
  const cors={'Access-Control-Allow-Origin':'*','Content-Type':'application/json; charset=utf-8'};
  if(req.method==='OPTIONS'){ res.writeHead(204,cors); return res.end(); }
  try{
    const html=await fetchText(LIST_URL);
    // rows: <a href="/singlehtml/ch26?cntId=XXX" title='115年7-8月期統一發票中獎號碼'>…</a> … <span>115-09-25</span>
    const rowRe=/cntId=([a-f0-9]+)[\s\S]{0,300}?(\d{3})年(\d{1,2})-(\d{1,2})月期統一發票中獎號碼[\s\S]{0,500}?<span>(\d{3}-\d{2}-\d{2})<\/span>/g;
    const found=[]; let m;
    while((m=rowRe.exec(html))){
      const [_,cntId,rocY,m1,m2,date]=m;
      // 標題「7-8月期」= 涵蓋 7、8 兩月 → key 'YYYY-07~08'（第二個月即標題的 m2）
      const key=`${+rocY+1911}-${String(m1).padStart(2,'0')}~${String(m2).padStart(2,'0')}`;
      found.push({key,url:'/singlehtml/ch26?cntId='+cntId,drawDate:greg(date.slice(0,3),date.slice(4,6),date.slice(7,9))});
    }
    const out={source:LIST_URL,fetchedAt:new Date().toISOString(),periods:{}};
    // only fetch detail pages for the periods the client asked for (max 5); 'latest' = newest period in list
    let want=(req.query.keys||'').split(',').filter(k=>found.some(f=>f.key===k)).slice(0,5);
    if((req.query.keys||'').includes('latest')) want=[...new Set([found[0]&&found[0].key,...want])].filter(Boolean).slice(0,5);
    for(const f of found){ if(want.includes(f.key)) out.periods[f.key]=await parsePeriod(f.url); }
    res.writeHead(200,cors);
    res.end(JSON.stringify({...out,available:found}));
  }catch(e){
    res.writeHead(502,cors);
    res.end(JSON.stringify({error:String(e.message||e)}));
  }
};
