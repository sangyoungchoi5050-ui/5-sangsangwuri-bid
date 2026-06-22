const http = require('http');
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
  const NM = {cnstwk:'공사', servc:'용역', thng:'물품'};
 
  const op   = (req.query.op   || 'servc').trim();
  const days = (req.query.days || '30').trim();
  const ntce = (req.query.ntce || '').trim();
  if (!OPS[op]) return res.status(400).json({ok:false, error:'invalid op'});
 
  const now=new Date(), from=new Date(now);
  from.setDate(from.getDate() - parseInt(days));
  const p = n => n<10 ? '0'+n : String(n);
  const fmt = d => `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}0000`;
 
  const qs = 'serviceKey='+KEY
    +'&numOfRows=100&pageNo=1&type=json&inqryDiv=1'
    +'&inqryBgnDt='+fmt(from)
    +'&inqryEndDt='+fmt(now).replace('0000','2359')
    +(ntce ? '&ntceInsttNm='+encodeURIComponent(ntce) : '');
 
  const path = '/1230000/ad/BidPublicInfoService/'+OPS[op]+'?'+qs;
 
  // http와 https 둘 다 시도
  async function tryFetch(useHttps) {
    return new Promise((resolve, reject) => {
      const mod = useHttps ? https : http;
      const opts = {
        hostname: 'apis.data.go.kr',
        port: useHttps ? 443 : 80,
        path,
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Node.js'
        }
      };
      const req2 = mod.request(opts, (r) => {
        let body = '';
        r.on('data', c => body += c);
        r.on('end', () => resolve({status: r.statusCode, body}));
      });
      req2.on('error', reject);
      req2.setTimeout(15000, () => { req2.destroy(); reject(new Error('timeout')); });
      req2.end();
    });
  }
 
  // 정제 함수
  function refine(json, op) {
    const raw = json?.response?.body?.items?.item;
    if (!raw) return [];
    const arr = Array.isArray(raw) ? raw : [raw];
    return arr.map(i => {
      const org = i.ntceInsttNm || '';
      let region = 'nara';
      if (org.includes('서울')) region = 'seoul';
      else if (['경기','수원','성남','의정부','안양','부천','광명','평택','동두천','안산',
        '고양','과천','구리','남양주','오산','시흥','군포','의왕','하남','용인',
        '파주','이천','안성','김포','화성','광주시','양주','포천','여주','연천',
        '가평','양평'].some(k => org.includes(k))) region = 'gyeonggi';
 
      // 첨부파일 정제
      const files = [];
      for (let n=1; n<=10; n++) {
        const url = i[`ntceSpecDocUrl${n}`] || '';
        const name = i[`ntceSpecFileNm${n}`] || '';
        if (url && name) files.push({ url, name });
      }
 
      // 필요한 필드만 정제해서 반환
      return {
        // 식별
        bidNo:    i.bidNtceNo    || '',
        ord:      i.bidNtceOrd   || '000',
        // 기본정보
        title:    i.bidNtceNm    || '제목없음',
        type:     NM[op],
        region,
        // 기관
        org:      org,
        demand:   i.dminsttNm   || '',
        // 금액
        budget:   i.asignBdgtAmt ? Number(i.asignBdgtAmt) : 0,
        budgetStr:i.asignBdgtAmt ? Number(i.asignBdgtAmt).toLocaleString('ko-KR')+'원' : '',
        // 일정
        openDt:   i.bidBeginDt  || '',
        closeDt:  i.bidClseDt   || '',
        openingDt:i.opengDt     || '',
        regDt:    i.rgstDt      || '',
        // 계약
        method:   i.cntrctCnclsMthdNm || '',
        kind:     i.ntceKindNm  || '',
        // 링크
        url:      i.bidNtceUrl  || '',
        // 첨부파일
        files
      };
    });
  }
 
  let result, method, errLog = [];
 
  // https 먼저 시도
  try {
    result = await tryFetch(true);
    method = 'https';
  } catch(e) {
    errLog.push('https: '+e.message);
    // http 재시도
    try {
      result = await tryFetch(false);
      method = 'http';
    } catch(e2) {
      errLog.push('http: '+e2.message);
      return res.status(500).json({ok:false, error:'연결 실패', detail: errLog});
    }
  }
 
  if (result.status !== 200) {
    return res.status(500).json({
      ok: false,
      error: 'HTTP '+result.status,
      body: result.body.substring(0, 200)
    });
  }
 
  let json;
  try { json = JSON.parse(result.body); }
  catch(e) {
    return res.status(500).json({
      ok: false,
      error: 'JSON parse failed',
      raw: result.body.substring(0, 300)
    });
  }
 
  const rc = json?.response?.header?.resultCode;
  if (rc && rc !== '00') {
    return res.status(500).json({
      ok: false,
      error: json?.response?.header?.resultMsg || rc
    });
  }
 
  const items = refine(json, op);
  res.json({
    ok: true,
    method,          // 어떤 방식으로 성공했는지
    total: items.length,
    items
  });
};
