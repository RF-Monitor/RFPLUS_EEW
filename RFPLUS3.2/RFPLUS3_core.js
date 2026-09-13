import * as utils from "./utils.js";
import numeric from "numeric";

/*----------計算三個多項式殘差----------*/
function residuals(p, x_a, x_b, x_c, y_a, y_b, y_c, d_a, d_b, d_c) {
    let [m, n, x] = p;
    
    // 方程 1: P 到 A 的距離
    let eq1 = utils.distanceCaculator(m,n,x_a,y_a) - (x + d_a)

    // 方程 2: P 到 B 的距離
    let eq2 = utils.distanceCaculator(m,n,x_b,y_b)- (x + d_b)

    // 方程 3: P 到 C 的距離
    let eq3 = utils.distanceCaculator(m,n,x_c,y_c) - (x + d_c)

    // 方程 4: P 到 D 的距離
    //let eq4 = distanceCaculator(m,n,x_d,y_d) - (x + d_d)
    //return [eq1, eq2, eq3, eq4];
    return [eq1, eq2, eq3];
}

/*----------三站定位----------*/
function location(a,b,c){
    let waveSPD = 3.5;
    let f = function(p) {
        let [m, n, x] = p;
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
        let residualsArray = residuals([m, n, x], x_a, x_b, x_c, y_a, y_b, y_c, d_a, d_b, d_c);
        //let x = residuals[3];

        let value = residualsArray.reduce((sum, r) => sum + r * r, 0);
        let penalty = 0;
        if (m < 20) penalty += (20 - m) ** 2;
        if (m > 26) penalty += (m - 26) ** 2;
        if (n < 118) penalty += (118 - n) ** 2;
        if (n > 124) penalty += (n - 124) ** 2;
        value += penalty * 1e6;
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

    return returnResult;
}
function distanceToResult(result, sta) {
    const dLat = (result[0] - parseFloat(sta.lat)) * 111;
    const dLon = (result[1] - parseFloat(sta.lon)) * 101;
    return Math.sqrt(dLat * dLat + dLon * dLon);
}
function filterByNormalStations(allResults, alert_list, normal_list) {
    return allResults.filter(result => {

        /* ---------- 1. 找最近的已觸發站 ---------- */
        let minAlertDist = Infinity;

        for (const sta of alert_list) {
            const d = distanceToResult(result, sta);
            if (d < minAlertDist) {
                minAlertDist = d;
            }
        }

        // 理論上不應發生，但保護一下
        if (!isFinite(minAlertDist)) return false;

        /* ---------- 2. 統計未觸發站 ---------- */
        let closerNormalCount = 0;

        for (const sta of normal_list) {
            const d = distanceToResult(result, sta);
            if (d < minAlertDist) {
                closerNormalCount++;
                if (closerNormalCount >= 2) {
                    return false; // 直接淘汰
                }
            }
        }

        /* ---------- 3. 保留合理解 ---------- */
        return true;
    });
}


/*----------消除異常值----------*/
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


export class RFPLUS3{
    constructor(){
        this.EEW = {
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
        this.alert_list = [];//觸發測站列表
        this.normal_list = [];//未觸發測站列表
        this.EEW_lock = false;
        this.final = false;
        this.state = "IDLE"
    }

    addData(rows){
        let time_now = Date.now();
        let triggered = false;
        this.normal_list = [];//清空未觸發測站列表

        //----------篩選測站----------//
        for(let i = 0; i < rows.length; i++){

            //檢查是否觸發或是否已離線
            if(rows[i]["alert"] && time_now - rows[i]["timestamp"] <= 5000){//已觸發測站
                
                triggered = true;
                let inList = false;
                //檢查是否已在列表內
                for(let j = 0;j < this.alert_list.length; j++){
                    if(this.alert_list[j]["id"] == rows[i]["id"]){//在觸發列表內
                        //檢查PGA是否降低
                        if(parseFloat(rows[i]["pga_origin_15"]) < parseFloat(this.alert_list[j]["pga_origin_15"])){//PGA降低
                            this.final = true; //收斂地震，停止計算，發布最終報
                            console.log("[RFPLUS3] PGA decreasing detected, declearde final");
                        }

                        inList = true;
                        let data = rows[i];
                        data["triggerTime"] = this.alert_list[j]["triggerTime"];//維持原觸發時間
                        data["isNew"] = false;
                        this.alert_list[j] = data;//更新觸發列表
                        break;
                    }
                }
                if(!inList){//新測站
                    let data = rows[i];
                    data["triggerTime"] = Date.now();//設現在為觸發時間
                    data["isNew"] = true;
                    this.alert_list.push(data);//加入觸發列表
                    console.log("[RFPLUS3]New station:",data.name)
                    console.log("[RFPLUS3]triggered station count:",this.alert_list.length)
                }
            }else if(!rows[i]["alert"] && time_now - rows[i]["timestamp"] <= 5000){ //未觸發測站
                let inList = false;
                //檢查是否已在列表內
                for(let j = 0;j < this.normal_list.length; j++){
                    if(this.normal_list[j]["id"] == rows[i]["id"]){//在觸發列表內
                        this.normal_list[j] = rows[i];
                        inList = true;
                        break;
                    }
                }
                if(!inList){
                    let data = rows[i];
                    this.normal_list.push(data);
                }
            }
        }

        return [this.alert_list, this.normal_list, triggered];
    }

    EEWcontrol(triggered){
        if(triggered && !this.EEW_lock && !this.final){
            const result = this.RFPLUS3calculate();
            if(!result) return 0;
            if(this.state != "ACTIVE"){
                console.log("[RFPLUS] ACTIVE")
            }
            this.state = "ACTIVE";

            return result;
        }
        if(!triggered) {//地震結束或無地震，回到初始狀態
            if(this.state != "IDLE"){
                console.log("[RFPLUS] IDLE")
            }
            this.state = "IDLE"
            
            this.alert_list = [];
            this.final = false;
            this.EEW_lock = false;
            return 0;
        }
        if(this.final && !this.EEW_lock) {//收斂地震
            if(this.state != "FINALIZED"){
                console.log("[RFPLUS] FINALIZED")
            }
            this.state = "FINALIZED"
            return 0;
        }
        return 0;
    }

    RFPLUS3calculate(){
        let centerLat = 0;
        let centerLon = 0;
        let centerDepth = 10;
        let epitime = 0;
        let locationTimes = 0;
        let allResults = [];
        if(this.alert_list.length >= 3 ){

            //取得所有優化結果
            for (let i = 0; i < this.alert_list.length - 2; i++) {
                for (let j = i + 1; j < this.alert_list.length - 1; j++) {
                    for (let k = j + 1; k < this.alert_list.length; k++) {
                        // 返回優化結果
                        let result = location(this.alert_list[i], this.alert_list[j], this.alert_list[k]);
                        allResults.push(result);
                    }
                }
            }
            //刪除異常結果(與未觸發站過近，不合理)
            allResults = filterByNormalStations(
                allResults,
                this.alert_list,
                this.normal_list
            );
            console.log(`[RFPLUS3] After normal-station filter: ${allResults.length}`);

            //刪除異常結果(離群)
            for(let i = 0; i < 2; i++){
                allResults = removeOutliers(allResults);
                console.log(`[RFPLUS3] After filtering, ${allResults.length} valid results remain.`);
            }

            if (allResults.length === 0) {
                console.warn("[RFPLUS3] All solutions rejected, skipping this round.");
                return 0;
            }
            
            //剩餘結果取平均
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


            let scale = 0;
            let scaleTimes = 0;
            for(let i = 0; i < this.alert_list.length; i++){
                if(1){
                    let pga = 0;
                    //判斷當下是p波還s波
                    let pgal = Math.sqrt(parseFloat(this.alert_list[i]["xo_15"]) * parseFloat(this.alert_list[i]["xo_15"]) + parseFloat(this.alert_list[i]["yo_15"]) * parseFloat(this.alert_list[i]["yo_15"]));
                    if(parseFloat(this.alert_list[i]["zo_15"]) >= pgal){
                        pga = parseFloat(this.alert_list[i]["pga_origin_15"]) * 3.5;
                    }else{
                        pga = parseFloat(this.alert_list[i]["pga_origin_15"]);
                    }
                        
                    if(1){
                        let distance = utils.distanceCaculator2(centerLat,centerLon,parseFloat(this.alert_list[i]["lat"]),parseFloat(this.alert_list[i]["lon"]),centerDepth);
                        //let rate_tmp = pga / Math.pow(distance, -1.607);
                        let scale_tmp = utils.calculateM(pga,distance);
                        scale = scale + scale_tmp;
                        scaleTimes++;
                    } 
                }
            }
            scale = scale / scaleTimes;

            let EEW_tmp = {
                "type":"RFPLUS3",
                "time": epitime,
                "center":{
                    "lat":centerLat,//float
                    "lon":centerLon,///float
                    "cname":"",//float
                    "depth":centerDepth
                },
                "scale":scale,
                "rate":0,
            }

            return EEW_tmp;

        } else {
            console.log("[RFPLUS3] Unable to locate when alert station length < 3");
            return 0;
        }
    }
    RFPLUS2calculate(){

    }

    async EEWgenerateReport({ EEW_tmp } = {}){

        //----------發布最終報----------//
        if(this.final && !this.EEW_lock){
            this.EEW_lock = true;
            console.log("[RFPLUS3]final report");
            if(this.EEW["id"] != "0"){
                let report_num = this.EEW["report_num"] + 1;
                this.EEW["report_num"] = report_num;
                this.EEW["final"] = true;
                this.EEW = EEW_tmp;
            }else{
                this.EEW = {
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
            console.log(JSON.stringify(this.EEW));
            return this.EEW;
        //----------無地震速報----------//
        }else if(!EEW_tmp){
            this.EEW = {
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
            return this.EEW;
        //----------發布一般報----------//
        }else if(!this.final){
            // 取得震央名稱
            const cname = await utils.getTownFromLatLon(EEW_tmp["center"]["lat"], EEW_tmp["center"]["lon"])
            EEW_tmp["center"]["cname"] = cname;

            // 發布更新報
            if(this.EEW["report_num"] != 0){
                //檢查內容是否有變化
                if(EEW_tmp["center"]["lat"] != this.EEW["center"]["lat"] || EEW_tmp["center"]["lon"] != this.EEW["center"]["lon"] || Math.round(EEW_tmp["scale"]) != Math.round(this.EEW["scale"])){
                    let report_num = this.EEW["report_num"] + 1;
                    let id = this.EEW["id"]
                    EEW_tmp["report_num"] = report_num;
                    EEW_tmp["id"] = id;
                    this.EEW = EEW_tmp;
                }
                return this.EEW;
            // 發布第一報
            }else{
                EEW_tmp["report_num"] = 1;
                EEW_tmp["id"] = Date.now().toString();
                this.EEW = EEW_tmp;
                return this.EEW;
            }
        }
        this.EEW = {
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
            return this.EEW;
    }
}