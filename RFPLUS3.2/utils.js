import xml2js from 'xml2js';

export async function getTownFromLatLon(lat, lon) {
    const url = `https://api.nlsc.gov.tw/other/TownVillagePointQuery?x=${lon}&y=${lat}`;
  
    try {
      const response = await fetch(url);
      const xml = await response.text();
      const result = await xml2js.parseStringPromise(xml);
      const item = result.townVillageItem;
  
      const ctyName = item.ctyName?.[0];
      const townName = item.townName?.[0];
  
      if (ctyName && townName) {
        return ctyName + townName;
      } else {
        return classifySeaArea(lat, lon);
      }
    } catch (error) {
      console.error('取得行政區失敗:', error);
      return classifySeaArea(lat, lon);
    }
}

export function classifySeaArea(lat, lon) {
    if (lat >= 23 && lat <= 25) {
      if (lon <= 121.1) return '臺灣西部海域';
      else return '臺灣東部海域';
    } else if (lat < 23) {
      if (lon > 120.8) return '臺灣東南部海域';
      else return '臺灣西南部海域';
    } else if (lat > 25) {
      if (lon > 121.5) return '臺灣東北部海域';
      else return '臺灣西北部海域';
    }
    return '遠地地震';
}
export function distanceCaculator(Xlat,Xlon,Ylat,Ylon){
    const dx = (Ylat - Xlat) * 111;
    const dy = (Ylon - Xlon) * 101;
  
    return Math.sqrt(dx*dx + dy*dy);    
}

export function distanceCaculator2(Xlat,Xlon,Ylat,Ylon,depth){
    const dx = (Ylat - Xlat) * 111;
    const dy = (Ylon - Xlon) * 101;
  
    return Math.sqrt(dx*dx + dy*dy + depth*depth);    
}

export function distanceCaculator3(Xlat,Xlon,Xdepth,Ylat,Ylon,Ydepth){
    const dx = (Ylat - Xlat) * 111;
    const dy = (Ylon - Xlon) * 101;
    const dz = (Ydepth - Xdepth);
  
    return Math.sqrt(dx*dx + dy*dy + dz*dz);    
}
export function haversine(lat1, lon1, lat2, lon2) {
    const earthRadius = 6371; // 地球平均半徑，單位 km
    const toRadians = degree => degree * Math.PI / 180;

    lat1 = toRadians(Number(lat1));
    lon1 = toRadians(Number(lon1));
    lat2 = toRadians(Number(lat2));
    lon2 = toRadians(Number(lon2));

    const deltaLat = lat2 - lat1;
    const deltaLon = lon2 - lon1;

    const a =
        Math.sin(deltaLat / 2) ** 2 +
        Math.cos(lat1) *
        Math.cos(lat2) *
        Math.sin(deltaLon / 2) ** 2;

    const centralAngle =
        2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadius * centralAngle;
}
export function calculateM(C, D) {
    // 確保 D 和 C 的值有效
    if (D <= 0 || C <= 0) {
        throw new Error("C 和 D 必須是正數");
    }

    // 常數值
    const a = 1.657; // 公式中的常數
    const b = -1.607; // D 的次方
    const k = 1.553; // M 的指數倍數

    // 計算公式
    const M = Math.log(C / (a * Math.pow(D, b))) / k;

    return M;
}

export function calculateR(M) {
    return 1.657 * Math.exp(1.533 * M);
}