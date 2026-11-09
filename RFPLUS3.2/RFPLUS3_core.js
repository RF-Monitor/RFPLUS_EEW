import * as utils from "./utils.js";
import {travelTimes, warningTime} from "./travel_time.js";
import numeric from "numeric";

function getLocationPenaltyConfig(stationCount){
    const progress = Math.max(0, Math.min(1, (stationCount - 5) / 5));

    return {
        radiusKm: 50 + 100 * progress,
        weight: (1 - progress) ** 2
    };
}

/*----------計算三個多項式殘差----------*/
function residuals(p, stations) {
    let [m, n, x] = p;

    return stations.map(station => {
        let lat = parseFloat(station.lat);
        let lon = parseFloat(station.lon);
        let d = Number(station.d);

        return utils.haversine(m,n,lat,lon) - (x + d);
    });
}
function residuals4(p, stations, referenceTime){
    let [m, n, o, x] = p;

    return stations.map(station => {
        let lat = Number(station.lat);
        let lon = Number(station.lon);
        let distance = utils.haversine(m,n,lat,lon);
        let times = travelTimes(o,distance,{bounds:"error", rounded:false});
        let travelTime = station.phase === "P" ? times.P : times.S;
        let observedTime = (station.triggerTime - referenceTime) / 1000;

        return observedTime - (x + travelTime);
    });
}

/*----------多站定位----------*/
function location(stations){
    if(stations.length < 3) return null;
    const freeDepth = stations.length >= 5;

    let stationData = stations.map(sta => {
        let waveSPD = 3.5;
        let phase = "S";
        let triggerTime = Number(sta["triggerTime"]);
        if(sta["s_timestamp"] > 0){
            triggerTime = Number(sta["s_timestamp"]);
        }else if(sta["p_timestamp"] > 0){
            triggerTime = Number(sta["p_timestamp"]);
            waveSPD = 6.5;
            phase = "P";
        }
        return {lat: parseFloat(sta["lat"]), lon: parseFloat(sta["lon"]), triggerTime: triggerTime, waveSPD: waveSPD, phase: phase};
    });

    if(stationData.some(sta => !Number.isFinite(sta.lat) || !Number.isFinite(sta.lon) || !Number.isFinite(sta.triggerTime) || sta.triggerTime <= 0)){
        return null;
    }

    const referenceTime = Math.min(...stationData.map(sta => sta.triggerTime));
    const baseStation = stationData.reduce((a,b) => a.triggerTime < b.triggerTime ? a : b);
    const initialTimes = travelTimes(10,0,{rounded:false});
    const initialX = -(baseStation.phase === "P" ? initialTimes.P : initialTimes.S);
    const centerLat = stationData.reduce((sum, sta) => sum + sta.lat, 0) / stationData.length;
    const centerLon = stationData.reduce((sum, sta) => sum + sta.lon, 0) / stationData.length;
    const penaltyConfig = getLocationPenaltyConfig(stationData.length);

    let f = function(p) {
        let m, n, o, x;
        if(freeDepth){
            [m, n, o, x] = p;
        }else{
            [m, n, x] = p;
            o = 10;
        }
        if(![m,n,o,x].every(Number.isFinite)) return 1e12;
        let penalty = Math.max(0,20 - m) ** 2 + Math.max(0,m - 26) ** 2;
        penalty += Math.max(0,118 - n) ** 2 + Math.max(0,n - 124) ** 2;
        penalty += Math.max(0,-o) ** 2 + Math.max(0,o - 300) ** 2;
        penalty += Math.max(0,x) ** 2;
        for(const sta of stationData){
            let distance = utils.haversine(m,n,sta.lat,sta.lon);
            penalty += Math.max(0,distance - 600) ** 2;
        }
        if(penalty > 0) return 1e6 * (1 + penalty);

        let residualsArray = residuals4([m, n, o, x],stationData,referenceTime);
        let value = residualsArray.reduce((sum, r) => sum + r * r, 0) / stationData.length;

        // 測站較少時限制遠距離解，5 至 10 站逐步放寬
        if(penaltyConfig.weight > 0){
            const distance = utils.haversine(m,n,centerLat,centerLon);
            const excessDistance = Math.max(0, distance - penaltyConfig.radiusKm);
            const penaltySpeed = 6.0; // 懲罰換算尺度，km/s，不是實際傳播波速
            value += penaltyConfig.weight * (excessDistance / penaltySpeed) ** 2;
        }

        return value;
    };

    let initialGuess = freeDepth ? [baseStation.lat, baseStation.lon, 10, initialX] : [baseStation.lat, baseStation.lon, initialX];
    let result = numeric.uncmin(f, initialGuess);
    if(!result.solution || !result.solution.every(Number.isFinite) || !Number.isFinite(result.f)){
        return null;
    }

    let returnResult = result.solution.slice();
    if(!freeDepth) returnResult.splice(2,0,10);

    let [m, n, o, x] = returnResult;
    if(!returnResult.every(Number.isFinite)) return null;
    if(m < 20 || m > 26 || n < 118 || n > 124 || o < 0 || o > 300 || x > 0){
        return null;
    }
    if(stationData.some(sta => utils.haversine(m,n,sta.lat,sta.lon) > 600)){
        return null;
    }

    returnResult[3] = referenceTime + x * 1000;
    const returnData = {
        lat: returnResult[0],
        lon: returnResult[1],
        depth: returnResult[2],
        time: returnResult[3]
    };

    return returnData;
}

function distanceToResult(result, sta) {
    const dLat = (result[0] - parseFloat(sta.lat)) * 111;
    const dLon = (result[1] - parseFloat(sta.lon)) * 101;
    return Math.sqrt(dLat * dLat + dLon * dLon);
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
        
        if(this.alert_list.length >= 3 ){

            let result = location(this.alert_list);
            if(!result){
                console.warn("[RFPLUS3] 定位失敗，跳過本輪計算");
                return 0;
            }
            centerLat = result.lat;
            centerLon = result.lon;
            centerDepth = result.depth;
            epitime = result.time;

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
                this.EEW["report_num"] += 1;
                this.EEW["final"] = true;
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
                if(EEW_tmp["center"]["lat"] != this.EEW["center"]["lat"] || EEW_tmp["center"]["lon"] != this.EEW["center"]["lon"] || EEW_tmp["center"]["depth"] != this.EEW["center"]["depth"] || EEW_tmp["time"] != this.EEW["time"] || Math.round(EEW_tmp["scale"]) != Math.round(this.EEW["scale"])){
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