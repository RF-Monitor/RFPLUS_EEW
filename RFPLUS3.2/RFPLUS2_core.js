const utils = require("./utils");

export class RFPLUS2{
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
            const result = this.EEWcalculate();
            if(!result) return 0;
            return result;
        }
        if(!triggered) {//地震結束或無地震，回到初始狀態
            this.alert_list = [];
            this.final = false;
            this.EEW_lock = false;
            return 0;
        }
        if(this.final && !this.EEW_lock) {//收斂地震，鎖定速報使其在發布最終報後不再更新直到地震結束
            
            return 0;
        }
    }

    EEWcalculate(){
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

            //刪除異常結果
            for(let i = 0; i < 2; i++){
                allResults = removeOutliers(allResults);
                console.log(`[RFPLUS3] After filtering, ${allResults.length} valid results remain.`);
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
    }
}