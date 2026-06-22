const https = require('https');
 
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
 
  const op   = (req.query.op   || 'servc').trim();
  const days = (req.query.days || '30').trim();
  const ntce = (req.query.ntce || '').trim();
  if (!OPS[op]) return res.status(400).json({ok:false,error:'invalid op'});
 
  const now=new Date(), from=new Date(now);
  from.setDate(from.getDate()-parseInt(days));
  const p=n=>n<10?'0'+n:String(n);
  const fmt=d=>`${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}0000`;
 
  // serviceKey 인코딩 없이 직접 연결 (공공데이터포털 방식)
  const path='/1230000/ad/BidPublicInfoService/'+OPS[op]
    +'?serviceKey='+KEY
    +'&numOfRows=100&pageNo=1&type=json&inqryDiv=1'
    +'&inqryBgnDt='+fmt(from)
    +'&inqryEndDt='+fmt(now).replace('0000','2359')
    +(ntce?'&ntceInsttNm='+encodeURIComponent(ntce):'');
 
  try {
    const raw = await new Promise((resolve,reject)=>{
      const r=https.request({
        hostname:'apis.data.go.kr',
        port:443,
        path,
        method:'GET',
        headers:{'Accept':'application/json','User-Agent':'Mozilla/5.0'}
      },(res2)=>{
        let d='';
        res2.setEncoding('utf8');
        res2.on('data',c=>d+=c);
        res2.on('end',()=>resolve({status:res2.statusCode,body:d}));
      });
      r.on('error',reject);
      r.setTimeout(20000,()=>{r.destroy();reject(new Error('timeout'));});
      r.end();
    });
 
    // 디버그: 실제 응답 100자 확인
    let json;
    try { json=JSON.parse(raw.body); }
    catch(e) {
      return res.status(500).json({
        ok:false, error:'parse failed',
        httpStatus:raw.status,
        raw:raw.body.substring(0,500)
      });
    }
 
    // API 레벨 에러 확인
    const rc=json?.response?.header?.resultCode;
    const msg=json?.response?.header?.resultMsg;
    if(rc&&rc!=='00'){
      return res.status(500).json({ok:false,error:msg||rc,resultCode:rc});
    }
 
    // 데이터 파싱
    const bodyItems=json?.response?.body?.items;
    // items가 빈 문자열이거나 null인 경우 처리
    if(!bodyItems||bodyItems===''){
      return res.json({
        ok:true, total:0, items:[],
        debug:{resultCode:rc,totalCount:json?.response?.body?.totalCount}
      });
    }
 
    const item=bodyItems.item;
    const arr=!item?[]:(Array.isArray(item)?item:[item]);
 
    const items=arr.map(i=>{
      const org=i.ntceInsttNm||'';
      let region='nara';
      if(org.includes('서울'))region='seoul';
      else if(['경기','수원','성남','의정부','안양','부천','광명','평택','동두천','안산',
        '고양','과천','구리','남양주','오산','시흥','군포','의왕','하남','용인',
        '파주','이천','안성','김포','화성','광주시','양주','포천','여주','연천',
        '가평','양평'].some(k=>org.includes(k)))region='gyeonggi';
      const files=[];
      for(let n=1;n<=10;n++){
        const fu=i[`ntceSpecDocUrl${n}`]||'',fn=i[`ntceSpecFileNm${n}`]||'';
        if(fu&&fn)files.push({url:fu,name:fn});
      }
      return {
        bidNo:i.bidNtceNo||'',ord:i.bidNtceOrd||'000',
        title:i.bidNtceNm||'제목없음',type:NM[op],region,
        org,demand:i.dminsttNm||'',
        budgetStr:i.asignBdgtAmt?Number(i.asignBdgtAmt).toLocaleString('ko-KR')+'원':'',
        openDt:i.bidBeginDt||'',closeDt:i.bidClseDt||'',
        openingDt:i.opengDt||'',regDt:i.rgstDt||'',
        method:i.cntrctCnclsMthdNm||'',kind:i.ntceKindNm||'',
        url:i.bidNtceUrl||'',files
      };
    });
 
    res.json({ok:true,total:items.length,items});
 
  } catch(e) {
    res.status(500).json({ok:false,error:e.message,path});
  }
};
