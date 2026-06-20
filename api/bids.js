module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const ANT_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANT_KEY) return res.status(500).json({ok:false, error:'ANTHROPIC_API_KEY missing'});

  const KEY = 'b19e4cd843e00917790fe943a72fa418e60ea05c924935d7845492c4f084922c';
  const OPS = {cnstwk:'getBidPblancListInfoCnstwk',servc:'getBidPblancListInfoServc',thng:'getBidPblancListInfoThng'};
  const NM  = {cnstwk:'공사',servc:'용역',thng:'물품'};

  const op   = req.query.op   || 'servc';
  const days = req.query.days || '30';
  const ntce = (req.query.ntce||'').trim();
  if (!OPS[op]) return res.status(400).json({ok:false,error:'invalid op'});

  const now=new Date(), from=new Date(now);
  from.setDate(from.getDate()-parseInt(days));
  const p=n=>n<10?'0'+n:String(n);
  const fmt=d=>`${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}0000`;

  const apiUrl='https://apis.data.go.kr/1230000/ad/BidPublicInfoService/'+OPS[op]
    +'?serviceKey='+KEY
    +'&numOfRows=100&pageNo=1&type=json&inqryDiv=1'
    +'&inqryBgnDt='+fmt(from)+'&inqryEndDt='+fmt(now).replace('0000','2359')
    +(ntce?'&ntceInsttNm='+encodeURIComponent(ntce):'');

  function parse(json){
    const raw=json?.response?.body?.items?.item;
    if(!raw)return[];
    const arr=Array.isArray(raw)?raw:[raw];
    return arr.map(i=>{
      const org=i.ntceInsttNm||'';
      let region='nara';
      if(org.includes('서울'))region='seoul';
      else if(['경기','수원','성남','의정부','안양','부천','광명','평택','동두천','안산','고양','과천','구리','남양주','오산','시흥','군포','의왕','하남','용인','파주','이천','안성','김포','화성','광주시','양주','포천','여주','연천','가평','양평'].some(k=>org.includes(k)))region='gyeonggi';
      const files=[];
      for(let n=1;n<=10;n++){const fu=i[`ntceSpecDocUrl${n}`]||'',fn=i[`ntceSpecFileNm${n}`]||'';if(fu&&fn)files.push({url:fu,name:fn});}
      return {region,bidTypeNm:NM[op],bidTypeKey:op,bidNo:i.bidNtceNo||'',ord:i.bidNtceOrd||'000',
        title:i.bidNtceNm||'제목없음',org,demandOrg:i.dminsttNm||'',
        amount:i.asignBdgtAmt?Number(i.asignBdgtAmt).toLocaleString('ko-KR')+'원':'',
        cntrctMethod:i.cntrctCnclsMthdNm||'',ntceKind:i.ntceKindNm||'',
        bidOpenDt:i.bidBeginDt||'',bidCloseDt:i.bidClseDt||'',opengDt:i.opengDt||'',
        rgstDt:i.rgstDt||'',bidNtceUrl:i.bidNtceUrl||'',files};
    });
  }

  try {
    const r=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':ANT_KEY,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({
        model:'claude-haiku-4-5-20251001',
        max_tokens:8192,
        tools:[{"type":"web_search_20250305","name":"web_search"}],
        system:'HTTP fetch helper. Use web_search to fetch the given URL and return ONLY the raw JSON. No explanation.',
        messages:[{role:'user',content:'Fetch this URL and return only the JSON response:\n'+apiUrl}]
      })
    });
    const d=await r.json();
    if(d.error)throw new Error(d.error.message);
    let txt='';
    (d.content||[]).forEach(c=>{if(c.type==='text')txt+=c.text;});
    let json=null;
    const m=txt.match(/```(?:json)?\s*([\s\S]*?)```/);
    if(m){try{json=JSON.parse(m[1].trim());}catch(e){}}
    if(!json){const m2=txt.match(/\{[\s\S]*\}/);if(m2)try{json=JSON.parse(m2[0]);}catch(e){}}
    if(!json)return res.status(500).json({ok:false,error:'parse failed',raw:txt.substring(0,200)});
    const items=parse(json);
    res.json({ok:true,total:items.length,items});
  } catch(e){
    res.status(500).json({ok:false,error:e.message});
  }
};
