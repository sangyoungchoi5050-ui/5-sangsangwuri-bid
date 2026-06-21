module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
 
  const KEY = 'b19e4cd843e00917790fe943a72fa418e60ea05c924935d7845492c4f084922c';
  const OPS = {
    cnstwk:'getBidPblancListInfoCnstwk',
    servc:'getBidPblancListInfoServc',
    thng:'getBidPblancListInfoThng'
  };
  const NM = {cnstwk:'공사',servc:'용역',thng:'물품'};
 
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
 
  try {
    // Vercel 서버에서 직접 fetch
    const r = await fetch(apiUrl);
    const text = await r.text();
    
    let json;
    try {
      json = JSON.parse(text);
    } catch(e) {
      return res.status(500).json({ok:false, error:'JSON parse failed', raw:text.substring(0,200)});
    }
 
    const rc = json?.response?.header?.resultCode;
    if (rc && rc !== '00') {
      return res.status(500).json({ok:false, error:json?.response?.header?.resultMsg||rc});
    }
 
    const raw = json?.response?.body?.items?.item;
    const arr = !raw ? [] : Array.isArray(raw) ? raw : [raw];
 
    const items = arr.map(i=>{
      const org=i.ntceInsttNm||'';
      let region='nara';
      if(org.includes('서울')) region='seoul';
      else if(['경기','수원','성남','의정부','안양','부천','광명','평택','동두천','안산','고양','과천','구리','남양주','오산','시흥','군포','의왕','하남','용인','파주','이천','안성','김포','화성','광주시','양주','포천','여주','연천','가평','양평'].some(k=>org.includes(k))) region='gyeonggi';
      const files=[];
      for(let n=1;n<=10;n++){
        const fu=i[`ntceSpecDocUrl${n}`]||'', fn=i[`ntceSpecFileNm${n}`]||'';
        if(fu&&fn) files.push({url:fu,name:fn});
      }
      return {
        region, bidTypeNm:NM[op], bidTypeKey:op,
        bidNo:i.bidNtceNo||'', ord:i.bidNtceOrd||'000',
        title:i.bidNtceNm||'제목없음', org, demandOrg:i.dminsttNm||'',
        amount:i.asignBdgtAmt?Number(i.asignBdgtAmt).toLocaleString('ko-KR')+'원':'',
        cntrctMethod:i.cntrctCnclsMthdNm||'', ntceKind:i.ntceKindNm||'',
        bidOpenDt:i.bidBeginDt||'', bidCloseDt:i.bidClseDt||'',
        opengDt:i.opengDt||'', rgstDt:i.rgstDt||'',
        bidNtceUrl:i.bidNtceUrl||'', files
      };
    });
 
    res.json({ok:true, total:items.length, items});
 
  } catch(e) {
    res.status(500).json({ok:false, error:e.message, apiUrl});
  }
};
