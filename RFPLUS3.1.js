var mysql = require('mysql');
var fs = require('fs');
const path = require("path")
const numeric = require('numeric');
const fetch = require('node-fetch');
const xml2js = require('xml2js');

async function getTownFromLatLon(lat, lon) {
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

// 備援：依照經緯度分類海域
function classifySeaArea(lat, lon) {
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
  return '未知區域';
}

function distanceCaculator(Xlat,Xlon,Ylat,Ylon){
    const dx = (Ylat - Xlat) * 111;
    const dy = (Ylon - Xlon) * 101;
  
    return Math.sqrt(dx*dx + dy*dy);    
}

function distanceCaculator2(Xlat,Xlon,Ylat,Ylon,depth){
    const dx = (Ylat - Xlat) * 111;
    const dy = (Ylon - Xlon) * 101;
  
    return Math.sqrt(dx*dx + dy*dy + depth*depth);    
}

function distanceCaculator3(Xlat,Xlon,Xdepth,Ylat,Ylon,Ydepth){
    const dx = (Ylat - Xlat) * 111;
    const dy = (Ylon - Xlon) * 101;
    const dz = (Ydepth - Xdepth);
  
    return Math.sqrt(dx*dx + dy*dy + dz*dz);    
}



function residuals(p, x_a, x_b, x_c, y_a, y_b, y_c, d_a, d_b, d_c) {
    let [m, n, x] = p;
    
    // 方程 1: P 到 A 的距離
    let eq1 = distanceCaculator(m,n,x_a,y_a) - (x + d_a)

    // 方程 2: P 到 B 的距離
    let eq2 = distanceCaculator(m,n,x_b,y_b)- (x + d_b)

    // 方程 3: P 到 C 的距離
    let eq3 = distanceCaculator(m,n,x_c,y_c) - (x + d_c)

    // 方程 4: P 到 D 的距離
    //let eq4 = distanceCaculator(m,n,x_d,y_d) - (x + d_d)
    //return [eq1, eq2, eq3, eq4];
    return [eq1, eq2, eq3];
}

function removeOutliers(arr) {
    if (arr.length <= 2) {
        console.warn("[RFPLUS3]Too few solutions,skipping filter.");
        return arr;
    } // 太少的数据无意义

    // 提取所有 a 和 b 值
    const aValues = arr.map(el => el[0]);
    const bValues = arr.map(el => el[1]);

    // 计算中位数的辅助函数
    function getMedian(values) {
        const sorted = values.slice().sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0
            ? sorted[mid]
            : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    // 计算 MAD 的辅助函数
    function getMAD(values, median) {
        const deviations = values.map(val => Math.abs(val - median));
        return getMedian(deviations);
    }

    // 计算 a 和 b 的中位数和 MAD
    const aMedian = getMedian(aValues);
    const aMAD = getMAD(aValues, aMedian);
    const bMedian = getMedian(bValues);
    const bMAD = getMAD(bValues, bMedian);

    // 定义离群值范围（中位数±3倍 MAD，可根据需求调整）
    const threshold = 2;

    // 过滤掉 a 或 b 明显异于其他值的元素
    return arr.filter(el => {
        const [a, b] = el;
        return (
            Math.abs(a - aMedian) <= threshold * aMAD &&
            Math.abs(b - bMedian) <= threshold * bMAD
        );
    });
}

const writeStream = fs.createWriteStream(path.join(__dirname, './alert.log'), { flags: 'a' });
filePath = "C:/earthquake server/source/RFPLUS3.txt"

function handleDisconnect_conn2() {
    conn2 = mysql.createConnection({
        host: 'localhost',
        user: 'ws',
        password: '',
        database:'pga',
        port: 3306,
        multipleStatements: true
    });
    conn2.connect((err) => {
        if (err) {
          console.error('Error connecting to MySQL pga DB:', err);
          setTimeout(handleDisconnect_conn2, 2000); // 2 seconds delay before attempting to reconnect
        } else {
          console.log('Connected to MySQLL pga DB');
        }
    });
    conn2.on('error', (err) => {
        console.error('Disconnected from MySQL pga DB,reconnecting:', err);
    
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            handleDisconnect_conn2(); // Reconnect on connection lost
        } else {
          throw err;
        }
    });
}

handleDisconnect_conn2()

function calculateM(C, D) {
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

function calculateR(M) {
    return 1.657 * Math.exp(1.533 * M);
}


function location(a,b,c){
    let f = function(p) {
        let x_a = parseFloat(a["lat"])
        let y_a = parseFloat(a["lon"])
        let z_a = 0;
        let d_a = 0;

        let x_b = parseFloat(b["lat"])
        let y_b = parseFloat(b["lon"])
        let z_b = 0
        let d_b = (b["triggerTime"] - a["triggerTime"]) / 1000 * waveSPD; //與a的震央距差(km)

        let x_c = parseFloat(c["lat"])
        let y_c = parseFloat(c["lon"])
        let z_c = 0
        let d_c = (c["triggerTime"] - a["triggerTime"]) / 1000 * waveSPD; //與a的震央距差(km)
        /*
        let x_d = parseFloat(near_center_list[3]["lat"])
        let y_d = parseFloat(near_center_list[3]["lon"])
        let z_d = 0
        let d_d = (near_center_list[3]["triggerTime"] - near_center_list[0]["triggerTime"]) / 1000 * waveSPD;
        */
        let residualsArray = residuals(p, x_a, x_b, x_c, y_a, y_b, y_c, d_a, d_b, d_c);
        //let x = residuals[3];
        //let penalty = (x < 0) ? 1000000 : 0;  // 如果x为负数，加大惩罚值
        let value = residualsArray.reduce((sum, r) => sum + r * r, 0);
        return value;
    };

    let initialGuess = [
        parseFloat(a["lat"]),
        parseFloat(a["lon"]),
        10
    ];
    // 使用 numeric.js 的最小二乘法來優化
    let result = numeric.uncmin(f, initialGuess);
    let returnResult = result.solution;
    returnResult[2] = a["triggerTime"] - (result.solution[2] * 1000)//a觸發時間戳 - 震波行經時間 = 發震時間


    /*
    let stations_print = [
        [parseFloat(a["lat"]),parseFloat(a["lon"]),a["triggerTime"]],
        [parseFloat(b["lat"]),parseFloat(b["lon"]),b["triggerTime"]],
        [parseFloat(c["lat"]),parseFloat(c["lon"]),c["triggerTime"]]
    ]*/
    //console.log(JSON.stringify(stations_print));
    //console.log(result.solution);

    return returnResult;
}
/*----------EEW變數----------*/
EEW = {
    "id":"0",
    "type":"none",
    "time":0,
    "center":{
        "lat":0,
        "lon":0,
        "depth":0,
        "cname":""
    },
    "scale":0,
    "rate":0,
    "report_num":0,
    "final":false
}
let RFPLUS_first = 0;
let RFPLUS_time = 0;
let waveSPD = 3.5;
let EEW_lock = false;
let final = false //當為true時停止計算，並發布發布最終報
let alert_list_before = []
let noTriggerCount = 0;

const getEEW = setInterval(()=>{
    conn2.query('SELECT * FROM station_list WHERE region != "JP" AND region != "CN" AND active = 1 AND sensitiveStation = 0', function(err, rows, fields) {
        if (err) {
            console.error('SQL query error:', err);
            return;
        }else{
            let time_now = Date.now();
            let alert_list = [];//RFPLUS3 測站列表
            let triggered = false;
            /*----------篩選測站----------*/
            for(let i = 0; i<rows.length; i++){

                //檢查是否觸發或是否已離線
                if(rows[i]["alert"] && time_now - rows[i]["timestamp"] <= 5000){
                    triggered = true;

                    //檢查是否已經在觸發列表內
                    for(let j = 0;j < alert_list_before.length; j++){
                        if(alert_list_before[j]["id"] == rows[i]["id"]){//在觸發列表內

                            //檢查PGA是否降低
                            if(parseFloat(rows[i]["pga_origin_15"]) < parseFloat(alert_list_before[j]["pga_origin_15"])){//PGA降低
                                final = true; //收斂地震，停止計算，發布最終報
                            }
                        }
                    }

                    //檢查是否已經在定位用測站列表內
                    let inList = false;
                    let triggerTime = 0
                    for (let j = 0; j < alert_list_before.length; j++) {
                        if (alert_list_before[j]["id"] == rows[i]["id"]) { // 在觸發列表內
                            inList = true;
                            triggerTime = alert_list_before[j]["triggerTime"];
                            alert_list_before.splice(j, 1); // 刪除該元素
                            break; // 防止繼續迴圈導致索引錯亂
                        }
                    }
                    //若為新測站，則標記觸發時間為現在
                    if(inList){
                        let data = rows[i];
                        data["triggerTime"] = triggerTime;//維持原觸發時間
                        alert_list.push(data);//加入觸發列表
                    }else{
                        let data = rows[i];
                        data["triggerTime"] = Date.now();//設現在為觸發時間
                        alert_list.push(data);//加入觸發列表
                    }
                }
            }

            //檢查是否有測站已結束晃動
            if(alert_list_before.length != 0){
                final = true; //收斂地震，停止計算，發布最終報
            }

            /*----------等待確認地震結束----------*/
            if(!triggered){
                noTriggerCount++;
                /*----------地震結束 解鎖新報----------*/
                if(noTriggerCount >= 10){
                    noTriggerCount = 0;
                    if(EEW_lock){
                        console.log("EEW unlocked");
                    }
                    RFPLUS_first = 0;
                    EEW_lock = false;
                    final = false;
                    EEW = {
                        "id":"0",
                        "type":"none",
                        "time":0,
                        "center":{
                            "lat":0,
                            "lon":0,
                            "depth":0,
                            "cname":""
                        },
                        "scale":0,
                        "rate":0,
                        "report_num":0,
                        "final":false
                    }
                }
            }

            /*----------EEW----------*/
            if(final && !EEW_lock){
                console.log("final report");
                //----------發布最終報----------//
                if(EEW["id"] != "0"){
                    let EEW_tmp = EEW;
                    let report_num = EEW["report_num"] + 1;
                    EEW_tmp["report_num"] = report_num;
                    EEW_tmp["final"] = true;
                    EEW = EEW_tmp;
                }else{
                    EEW = {
                        "id":"0",
                        "type":"none",
                        "time":0,
                        "center":{
                            "lat":0,
                            "lon":0,
                            "depth":0,
                            "cname":""
                        },
                        "scale":0,
                        "rate":0,
                        "report_num":0,
                        "final":false
                    }
                }
                console.log(JSON.stringify(EEW));
                EEW_lock = true;
            }else{

                /*----------RFPLUS3----------*/
                if(alert_list.length >= 3 && !EEW_lock){
                    //----------平面求解----------//
                    let centerLat = 0;
                    let centerLon = 0;
                    let centerDepth = 10;
                    let epitime = 0;
                    let locationTimes = 0;
                    let allResults = [];

                    for (let i = 0; i < alert_list.length - 2; i++) {
                        for (let j = i + 1; j < alert_list.length - 1; j++) {
                            for (let k = j + 1; k < alert_list.length; k++) {
                                // 返回優化結果
                                let result = location(alert_list[i], alert_list[j], alert_list[k]);
                                allResults.push(result);
                                /*
                                let centerLatTmp = result[0];
                                let centerLonTmp = result[1];
                                let timeTmp = alert_list[i]["triggerTime"] / 1000 - (result[2] * waveSPD);

                                centerLat = centerLat + centerLatTmp;
                                centerLon = centerLon + centerLonTmp;
                                epitime = epitime + timeTmp;
                                locationTimes++;
                                */
                            }
                        }
                    }
                    //----------使用MAD過濾異常值 過濾兩次----------//
                    for(let i = 0; i < 2; i++){
                        allResults = removeOutliers(allResults);
                        console.log(`[RFPLUS3] After filtering, ${allResults.length} valid results remain.`);
                    }
                    
                    for (let i = 0; i < allResults.length; i++) {
                        let centerLatTmp = allResults[i][0];
                        let centerLonTmp = allResults[i][1];
                        let timeTmp = allResults[i][2];
                        centerLat = centerLat + centerLatTmp;
                        centerLon = centerLon + centerLonTmp;
                        epitime = epitime + timeTmp;
                        locationTimes++;
                    }

                    centerLat = centerLat / locationTimes;
                    centerLon = centerLon / locationTimes;
                    epitime = epitime / locationTimes;

                    let EEW_tmp = {
                        "type":"RFPLUS3",
                        "time": epitime,
                        "center":{
                            "lat":centerLat,//float
                            "lon":centerLon,///float
                            "cname":"",//float
                            "depth":10
                        },
                        "scale":0,
                        "rate":0,
                    }
                    //console.log(JSON.stringify(EEW_tmp));

                    //----------計算規模----------//
                    let scale = 0;
                    let scaleTimes = 0;
                    for(let i = 0; i<alert_list.length; i++){
                        //if(alert_list[i]["id"] != RFPLUS_first["id"]){
                        if(1){
                            let pga = 0;
                            //判斷當下是p波還s波
                            let pgal = Math.sqrt(parseFloat(alert_list[i]["xo_15"]) * parseFloat(alert_list[i]["xo_15"]) + parseFloat(alert_list[i]["yo_15"]) * parseFloat(alert_list[i]["yo_15"]));
                            if(parseFloat(alert_list[i]["zo_15"]) >= pgal){
                                pga = parseFloat(alert_list[i]["pga_origin_15"]) * 3.5;
                            }else{
                                pga = parseFloat(alert_list[i]["pga_origin_15"]);
                            }
                            
                            if(1){
                                let distance = distanceCaculator2(centerLat,centerLon,parseFloat(alert_list[i]["lat"]),parseFloat(alert_list[i]["lon"]),centerDepth);
                                //let rate_tmp = pga / Math.pow(distance, -1.607);
                                let scale_tmp = calculateM(pga,distance);
                                scale = scale + scale_tmp;
                                scaleTimes++;
                            } 
                        }
                    }
                    EEW_tmp["scale"] = scale / scaleTimes;

                    //----------取得震央名稱----------//
                    getTownFromLatLon(EEW_tmp["center"]["lat"], EEW_tmp["center"]["lon"]).then(cname => {

                        EEW_tmp["center"]["cname"] = cname;
                        //----------有前報 設為更新報----------//
                        if(EEW["report_num"] != 0){
                            //如果計算結果有變動 更新報
                            if(EEW_tmp["center"]["lat"] != EEW["center"]["lat"] || EEW_tmp["center"]["lon"] != EEW["center"]["lon"] || Math.round(EEW_tmp["scale"]) != Math.round(EEW["scale"])){
                                let report_num = EEW["report_num"] + 1;
                                let id = EEW["id"]
                                EEW_tmp["report_num"] = report_num;
                                EEW_tmp["id"] = id;
                                EEW = EEW_tmp;
                                console.log(allResults);
                                console.log(JSON.stringify(EEW));
                                fs.writeFile("RFPLUS3_record/"+Date.now().toString()+".json", JSON.stringify(EEW), (err) => {
                                    if (err) {
                                        console.error('There is an error while writing RFPLUS file:', err);
                                    }
                                });
                                //writeStream.write(`${JSON.stringify(RFPLUS)}\n`);
                            }
                        //----------設為第一報----------//
                        }else{
                            EEW_tmp["report_num"] = 1;
                            EEW_tmp["id"] = Date.now().toString();
                            EEW = EEW_tmp;
                            console.log(allResults);
                            console.log(JSON.stringify(EEW));
                            fs.writeFile("RFPLUS3_record/"+Date.now().toString()+".json", JSON.stringify(EEW), (err) => {
                                if (err) {
                                    console.error('There is an error while writing RFPLUS file:', err);
                                }
                            });
                            //writeStream.write(`${JSON.stringify(RFPLUS)}\n`);
                        }
                    });

                /*----------RFPLUS2----------*/
                }else if(alert_list.length == 2 && !EEW_lock){
                
                    //----------計算兩站距離----------//
                    let stationDistance = distanceCaculator(parseFloat(alert_list[0]["lat"]),parseFloat(alert_list[0]["lon"]),parseFloat(alert_list[1]["lat"]),parseFloat(alert_list[1]["lon"]));

                    if(stationDistance <= 100){

                        //----------尋找假定中心(RFPLUS_first)----------//
                        if(!RFPLUS_first){
                            let RFPLUS_first_tmp = 0
                            for(let i = 0;i<alert_list.length;i++){
                                if(parseFloat(alert_list[i]["pga_origin_15"]) >= 5 && time_now - alert_list[i]["timestamp"] <= 5000){
                                    if(RFPLUS_first_tmp == 0){
                                        RFPLUS_first_tmp = alert_list[i];
                                        RFPLUS_time = alert_list[i]["timestamp"];
                                        RFPLUS_first_lock = true;
                                    }else if(parseFloat(alert_list[i]["pga_origin_15"]) > parseFloat(RFPLUS_first_tmp["pga_origin_15"])){
                                        RFPLUS_first_tmp = alert_list[i];
                                        RFPLUS_time = alert_list[i]["timestamp"];
                                        RFPLUS_first_lock = true;
                                    }
                                }
                            }
                            if(RFPLUS_first_tmp){
                                console.log("RFPLUS_first checked:" + RFPLUS_first_tmp["name"]);
                                RFPLUS_first = RFPLUS_first_tmp;
                            }

                        //----------更新假定中心(RFPLUS_first)----------//
                        }else{
                            for(let i = 0;i<alert_list.length;i++){
                                if(alert_list[i]["id"] == RFPLUS_first["id"]){
                                    //第一站PGA上升 更新PGA資訊
                                    if(parseFloat(alert_list[i]["pga_origin_15"]) > parseFloat(RFPLUS_first["pga_origin_15"])){
                                        RFPLUS_first = alert_list[i];
                                        console.log("RFPLUS_first updated");
                                    }
                                }
                            }
                        }

                        //----------計算----------//
                        if(RFPLUS_first){
                            let scale = 0;
                            let rate = 0;
                            let count = 0;
                            for(let i = 0; i<alert_list.length; i++){
                            //if(alert_list[i]["id"] != RFPLUS_first["id"]){
                                if(1){
                                    //let pga_diff = parseFloat(RFPLUS_first["pga_origin_15"]) - parseFloat(alert_list[i]["pga_origin_15"]);//加速度差
                                    let pga = 0;
                                    //判斷當下是p波還s波
                                    let pgal = Math.sqrt(parseFloat(alert_list[i]["xo_15"]) * parseFloat(alert_list[i]["xo_15"]) + parseFloat(alert_list[i]["yo_15"]) * parseFloat(alert_list[i]["yo_15"]));
                                    if(parseFloat(alert_list[i]["zo_15"]) >= pgal){
                                        pga = parseFloat(alert_list[i]["pga_origin_15"]) * 3.5;
                                    }else{
                                        pga = parseFloat(alert_list[i]["pga_origin_15"]);
                                    }
                                    
                                    //if(pga_diff > 0){
                                    if(1){
                                        let distance = distanceCaculator2(parseFloat(RFPLUS_first["lat"]),parseFloat(RFPLUS_first["lon"]),parseFloat(alert_list[i]["lat"]),parseFloat(alert_list[i]["lon"]),10);
                                        //let rate_tmp = pga_diff / distance;
                                        let scale_tmp = calculateM(pga,distance);
                                        scale = scale + scale_tmp;
                                        count++;
                                        console.log(alert_list[i]["name"]);
                                        console.log(pga);
                                        console.log(scale_tmp);
                                    } 
                                }
                            }
                            if(count >= 2){//資料有效(有兩站以上的資料)
                                rate = calculateR(scale / count);
                                let RFPLUS_tmp = {
                                    "type":"RFPLUS2",
                                    "time":RFPLUS_time,
                                    "center":{
                                        "lat":parseFloat(RFPLUS_first["lat"]),//float
                                        "lon":parseFloat(RFPLUS_first["lon"]),///float
                                        "pga":parseFloat(RFPLUS_first["pga_origin_15"]),//float
                                        "cname":RFPLUS_first["cname"].replace(" ","")
                                    },
                                    "rate":rate,//float
                                    "scale":0,
                                    "final":false
                                }
                                if(EEW["report_num"] != 0){
                                    //如果計算結果有變動 更新報
                                    if(RFPLUS_tmp["center"]["lat"] != EEW["center"]["lat"] || RFPLUS_tmp["center"]["lon"] != EEW["center"]["lon"] || Math.round(RFPLUS_tmp["rate"]) != Math.round(EEW["rate"])){
                                        let report_num = EEW["report_num"] + 1;
                                        let id = EEW["id"]
                                        RFPLUS_tmp["report_num"] = report_num;
                                        RFPLUS_tmp["id"] = id;
                                        EEW = RFPLUS_tmp;
                                        console.log(JSON.stringify(EEW));
                                        fs.writeFile("RFPLUS3_record/"+Date.now().toString()+".json", JSON.stringify(EEW), (err) => {
                                            if (err) {
                                            console.error('There is an error while writing RFPLUS file:', err);
                                            }
                                        });
                                        //writeStream.write(`${JSON.stringify(RFPLUS)}\n`);
                                    }
                                //設為第一報
                                }else{
                                    RFPLUS_tmp["report_num"] = 1;
                                    RFPLUS_tmp["id"] = RFPLUS_time.toString();
                                    EEW = RFPLUS_tmp;
                                    console.log(JSON.stringify(EEW));
                                    fs.writeFile("RFPLUS3_record/"+Date.now().toString()+".json", JSON.stringify(EEW), (err) => {
                                        if (err) {
                                        console.error('There is an error while writing RFPLUS file:', err);
                                        }
                                    });
                                    //writeStream.write(`${JSON.stringify(RFPLUS)}\n`);
                                }
                            }
                        }
                    }
                }
            }

            alert_list_before = alert_list;
            alert_list = [];
            /*----------生成速報檔案----------*/
            fs.writeFile(filePath, JSON.stringify(EEW), (err) => {
                
                if (err) {
                console.error('There is an error while writing RFPLUS file:', err);
                }
            });
        }
    })
},1000)
