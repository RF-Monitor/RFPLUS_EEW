var mysql = require('mysql');
var fs = require('fs');
const path = require("path")
const numeric = require('numeric');
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

function calculateM(R) {
    if (R <= 0) {
        throw new Error("Invalid input: R must be > 0.");
    }

    const numerator = Math.log(R / 1.657);
    const denominator = 1.553;
    return numerator / denominator;
}

function residuals(p, x_a, x_b, x_c, y_a, y_b, y_c, d_a, d_b, d_c) {
    let [m, n, x] = p;
    //let x = distanceCaculator(m,n,x_a,y_a)
    
    // 方程 1: P 到 A 的距離
    //let eq1 = Math.sqrt(Math.pow(m - x_a, 2) + Math.pow(n - y_a, 2) + Math.pow(o - z_a, 2)) - (x + d_a);
    let eq1 = distanceCaculator(m,n,x_a,y_a) - (x + d_a)

    // 方程 2: P 到 B 的距離
    //let eq2 = Math.sqrt(Math.pow(m - x_b, 2) + Math.pow(n - y_b, 2) + Math.pow(o - z_b, 2)) - (x + d_b);
    let eq2 = distanceCaculator(m,n,x_b,y_b)- (x + d_b)

    // 方程 3: P 到 C 的距離
    //let eq3 = Math.sqrt(Math.pow(m - x_c, 2) + Math.pow(n - y_c, 2) + Math.pow(o - z_c, 2)) - (x + d_c);
    let eq3 = distanceCaculator(m,n,x_c,y_c) - (x + d_c)

    // 方程 4: P 到 D 的距離
    //let eq4 = Math.sqrt(Math.pow(m - x_d, 2) + Math.pow(n - y_d, 2) + Math.pow(o - z_d, 2)) - (x + d_d);
    //let eq4 = distanceCaculator(m,n,x_d,y_d) - (x + d_d)
    //return [eq1, eq2, eq3, eq4];
    return [eq1, eq2, eq3];
}

const writeStream = fs.createWriteStream(path.join(__dirname, './alert.log'), { flags: 'a' });
filePath = "C:/earthquake server/source/RFPLUS2.txt"
filePath3 = "C:/earthquake server/source/RFPLUS3.txt"
stations = "";
RFPLUS = {
    "id":"0",
    "time":0,
    "center":{
        "lat":0,
        "lon":0,
        "pga":0,
        "cname":""
    },
    "rate":0,
    "report_num":0,
    "final":false
}
EEW = {
    "id":"0",
    "time":0,
    "center":{
        "lat":0,
        "lon":0,
        "depth":0,
        "cname":""
    },
    "scale":0,
    "report_num":0,
    "final":false
}
//RFPLUS變數
let RFPLUS_first = 0;
let RFPLUS_time = 0;
let RFPLUS_second = 0;
let RFPLUS_first_lock = false;//所有測站未觸發時解鎖

//EEW變數


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

let final = false //當為true時停止計算，並發布發布最終報

alert_list = [];//RFPLUS2 觸發列表
alert_list_before = [];//RFPLUS2 前一次的觸發列表
near_center_list = [];//RFPLUS3 測站列表(選4台最先觸發的測站)
near_center_list_before = []//RFPLUS3 前一次定位用測站列表

const getEEW = setInterval(()=>{
    conn2.query('SELECT * FROM station_list WHERE region != "JP" AND region != "CN"', function(err, rows, fields) {
        let time_now = Date.now();
        let shake_alert = 0;//警報(0 or 1)
        let shake_alert_count = 0;//觸發測站計數
        let alert_dist = [];//所有觸發測站的經緯度[[lat,lon],[lat,lon]]

        /*----------篩選觸發測站----------*/
        let triggered = false;
        for(let i = 0; i<rows.length; i++){
            let triggerS = false;
            //檢查是否觸發或是否已離線
            if(rows[i]["alert"] && time_now - rows[i]["timestamp"] <= 5000){

                //檢查是否已經在觸發列表內
                for(let j = 0;j < alert_list_before.length; j++){
                    if(alert_list_before[j]["id"] == rows[i]["id"]){//在觸發列表內
                        //檢查PGA是否降低
                        if(parseFloat(rows[i]["pga_origin_15"]) < parseFloat(alert_list_before[j]["pga_origin_15"])){//PGA降低
                            final = true //收斂地震，停止計算，發布最終報
                        }
                        //檢查PGA是否增加
                        if(parseFloat(rows[i]["pga_origin_15"]) > parseFloat(alert_list_before[j]["pga_origin_15"])){//PGA降低
                            triggerS  = true;
                        }
                    }
                }
                //未在觸發列表內
                let data = rows[i];
                data["triggerTime"] = Date.now();//p到達時間
                if(triggerS){data["triggerSTime"] = Date.now()}
                alert_list.push(data)//新增至觸發列表
                alert_dist.push([parseFloat(rows[i]["lat"]),parseFloat(rows[i]["lon"])]);//新增至經緯度列表
                shake_alert_count++;
                triggered = true;

                //檢查是否已經在定位用測站列表內
                let inList = false;
                for(let j = 0;j < near_center_list.length; j++){
                    if(near_center_list[j]["id"] == rows[i]["id"]){//在觸發列表內
                        inList = true;
                    }
                }
                //未在觸發列表內 加入定位用測站列表
                if(!inList && near_center_list.length < 3){
                    let data = rows[i];
                    data["triggerTime"] = Date.now();//p到達時間
                    if(triggerS){data["triggerSTime"] = Date.now()}//s到達時間
                    near_center_list.push(rows[i])//新增至觸發列表
                }
            }
        }

        //觸發測站數>=2
        if(shake_alert_count >= 2){
            if(shake_alert_count > 2){//超過2站 直接發報
              shake_alert = 1;
            }else if(shake_alert_count == 2){//2站 計算距離
              let lattokm = (alert_dist[0][0] - alert_dist[1][0]) * 111//緯度換算公里
              let lontokm = (alert_dist[0][1] - alert_dist[1][1]) * 102//經度換算公里
              let dist = Math.sqrt((lattokm * lattokm) + (lontokm * lontokm));//距離
              if(dist <= 100){
                shake_alert = 1;
              }
            }
        }

        /*----------無觸發 清空警報 解鎖發布新報----------*/
        if(!triggered){
            if(RFPLUS_first_lock){
                console.log("RFPLUS_first unlocked");
            }
            RFPLUS_first= 0;
            RFPLUS_time = 0
            RFPLUS_first_lock = false;
            final = false;
            near_center_list = []
        }

        /*----------未確認第一站----------*/
        if(!RFPLUS_first && !RFPLUS_first_lock && shake_alert){
            //尋找第一站
            let a = 1;
            let RFPLUS_first_tmp = 0
            for(let i = 0;i<alert_list.length;i++){
                //找到第一站
                if(parseFloat(alert_list[i]["pga_origin_15"]) >= 5 && time_now - alert_list[i]["timestamp"] <= 5000){
                    if(RFPLUS_first_tmp == 0){
                        RFPLUS_first_tmp = alert_list[i];
                        RFPLUS_time = alert_list[i]["timestamp"];
                        a = 0;
                        RFPLUS_first_lock = true;
                    }else if(parseFloat(alert_list[i]["pga_origin_15"]) > parseFloat(RFPLUS_first_tmp["pga_origin_15"])){
						RFPLUS_first_tmp = alert_list[i];
                        RFPLUS_time = alert_list[i]["timestamp"];
                        a = 0;
                        RFPLUS_first_lock = true;
					}
                }
            }
            if(a){
                //無第一站
                RFPLUS_first = 0;
            }else{
                console.log("RFPLUS_first checked:" + RFPLUS_first_tmp["name"]);
                RFPLUS_first = RFPLUS_first_tmp;
            }
        }


        /*----------RFPLUS2----------*/
        if(RFPLUS_first){
            //更新第一站資料
            for(let i = 0;i<rows.length;i++){
                if(rows[i]["id"] == RFPLUS_first["id"]){
                    //第一站PGA上升 更新PGA資訊
                    if(parseFloat(rows[i]["pga_origin_15"]) > parseFloat(RFPLUS_first["pga_origin_15"])){
                        RFPLUS_first = rows[i];
                        console.log("RFPLUS_first updated:");
                    }
                    //第一站喪失資格
                    /*
                    if(parseFloat(rows[i]["pga_origin_15"]) < 10 || time_now - rows[i]["timestamp"] >= 5000){
                        RFPLUS_first= 0;
                        console.log("RFPLUS_first cancelled");
                        console.log(rows[i]["pga_origin_15"]);
                        console.log(time_now - rows[i]["timestamp"]);
                    }
                    */
                }
            }
            
            /*----------判斷收斂地震----------*/
            if(final){
                //發布最終報
                if(RFPLUS["rate"] != 0){//存在上一個有效報
                   let RFPLUS_tmp = RFPLUS;
                   let report_num = RFPLUS["report_num"] + 1;
                   RFPLUS_tmp["report_num"] = report_num;
                   RFPLUS_tmp["final"] = true;
                   RFPLUS = RFPLUS_tmp;
                }else{//資料無效
                    RFPLUS = {
                        "id":"0",
                        "time":0,
                        "center":{
                            "lat":0,
                            "lon":0,
                            "pga":0,
                            "cname":""
                        },
                        "rate":0,
                        "report_num":0,
                        "final":false
                    }
                }
            /*----------繼續計算----------*/
            }else{
                /*----------RFPLUS----------*/
                let rate = 0;
                let count = 0;
                //RFPLUS2
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
                            let rate_tmp = pga / Math.pow(distance, -1.607);
                            rate = rate + rate_tmp;
                            count++;
                            console.log(alert_list[i]["name"]);
                            console.log(pga);
                            console.log(rate_tmp);
                        } 
                    }
                }
                
                if(count >= 2){//資料有效(有兩站以上的資料)
                    rate = rate / count;
                    let RFPLUS_tmp = {
                        "time":RFPLUS_time,
                        "center":{
                            "lat":parseFloat(RFPLUS_first["lat"]),//float
                            "lon":parseFloat(RFPLUS_first["lon"]),///float
                            "pga":parseFloat(RFPLUS_first["pga_origin_15"]),//float
                            "cname":RFPLUS_first["cname"].replace(" ","")
                        },
                        "rate":rate,//float
                        "final":false
                    }
                    if(RFPLUS["report_num"] != 0){
                        //如果計算結果有變動 更新報
                        if(RFPLUS_tmp["center"]["lat"] != RFPLUS["center"]["lat"] || RFPLUS_tmp["center"]["lon"] != RFPLUS["center"]["lon"] || Math.round(RFPLUS_tmp["rate"]) != Math.round(RFPLUS["rate"])){
                            let report_num = RFPLUS["report_num"] + 1;
                            let id = RFPLUS["id"]
                            RFPLUS_tmp["report_num"] = report_num;
                            RFPLUS_tmp["id"] = id;
                            RFPLUS = RFPLUS_tmp;
                            console.log(JSON.stringify(RFPLUS));
                            writeStream.write(`${JSON.stringify(RFPLUS)}\n`);
                        }
                    //設為第一報
                    }else{
                        RFPLUS_tmp["report_num"] = 1;
                        RFPLUS_tmp["id"] = RFPLUS_time.toString();
                        RFPLUS = RFPLUS_tmp;
                        console.log(JSON.stringify(RFPLUS));
                        writeStream.write(`${JSON.stringify(RFPLUS)}\n`);
                    }
                    
                }else{//資料無效(只有震央 沒有rate)
                    RFPLUS = {
                        "id":"0",
                        "time":0,
                        "center":{
                            "lat":0,
                            "lon":0,
                            "pga":0,
                            "cname":""
                        },
                        "rate":0,
                        "report_num":0,
                        "final":false
                    }
                }
            }
            
        /*----------無第一站----------*/
        }else{
            RFPLUS = {
                "id":"0",
                "time":0,
                "center":{
                    "lat":0,
                    "lon":0,
                    "pga":0,
                    "cname":""
                },
                "rate":0,
                "report_num":0,
                "final":false
            }
        }


        /*----------EEW----------*/
        let waveSPD = 3.5;
        //console.log(near_center_list.length)
        if(near_center_list.length >= 3){
            if(final){
                //----------發布最終報----------//
            }else{
                //----------平面求解----------//
                let f = function(p) {
                    let x_a = parseFloat(near_center_list[0]["lat"])
                    let y_a = parseFloat(near_center_list[0]["lon"])
                    let z_a = 0;
                    let d_a = 0;

                    let x_b = parseFloat(near_center_list[1]["lat"])
                    let y_b = parseFloat(near_center_list[1]["lon"])
                    let z_b = 0
                    let d_b = (near_center_list[1]["triggerTime"] - near_center_list[0]["triggerTime"]) / 1000 * waveSPD;

                    let x_c = parseFloat(near_center_list[2]["lat"])
                    let y_c = parseFloat(near_center_list[2]["lon"])
                    let z_c = 0
                    let d_c = (near_center_list[2]["triggerTime"] - near_center_list[0]["triggerTime"]) / 1000 * waveSPD;
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
                    parseFloat(near_center_list[0]["lat"]),
                    parseFloat(near_center_list[0]["lon"]),
                    10
                ];
                // 使用 numeric.js 的最小二乘法來優化
                let result = numeric.uncmin(f, initialGuess);
                let stations_print = [
                    [parseFloat(near_center_list[0]["lat"]),parseFloat(near_center_list[0]["lon"]),near_center_list[0]["triggerTime"]],
                    [parseFloat(near_center_list[1]["lat"]),parseFloat(near_center_list[1]["lon"]),near_center_list[1]["triggerTime"]],
                    [parseFloat(near_center_list[2]["lat"]),parseFloat(near_center_list[2]["lon"]),near_center_list[2]["triggerTime"]]
                ];
                console.log(JSON.stringify(stations_print));
                console.log(result.solution);  // 返回優化結果
                let centerLat = result[0];
                let centerLon = result[1];
                let centerDepth = 10;
                let EEW_tmp = {
                    "time": near_center_list[0]["triggerTime"] / 1000 - result[3] * waveSPD,
                    "center":{
                        "lat":centerLat,//float
                        "lon":centerLon,///float
                        "cname":"",//float
                        "depth":10
                    },
                    "scale":0,
                }
                console.log(JSON.stringify(EEW_tmp));

                //----------計算規模----------//
                let scale = 0;
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
                            let distance = distanceCaculator2(centerLat,centerLon,parseFloat(alert_list[i]["lat"]),parseFloat(alert_list[i]["lon"]),centerDepth);
                            let rate_tmp = pga / Math.pow(distance, -1.607);
                            let scale_tmp = calculateM(rate_tmp)
                            scale = scale + scale_tmp;
                        } 
                    }
                }
                EEW_tmp = {
                    "time": near_center_list[0]["triggerTime"] / 1000 - result[3] * waveSPD,
                    "center":{
                        "lat":centerLat,//float
                        "lon":centerLon,///float
                        "cname":"",//float
                        "depth":10
                    },
                    "scale":scale,
                    "final":false
                }
                if(EEW["report_num"] != 0){
                    //如果計算結果有變動 更新報
                    if(EEW_tmp["center"]["lat"] != EEW["center"]["lat"] || EEW_tmp["center"]["lon"] != EEW["center"]["lon"] || Math.round(EEW_tmp["scale"]) != Math.round(EEW["scale"])){
                        let report_num = EEW["report_num"] + 1;
                        let id = EEW["id"]
                        EEW_tmp["report_num"] = report_num;
                        EEW_tmp["id"] = id;
                        EEW = EEW_tmp;
                        console.log(JSON.stringify(EEW));
                        //writeStream.write(`${JSON.stringify(RFPLUS)}\n`);
                    }
                //設為第一報
                }else{
                    EEW_tmp["report_num"] = 1;
                    EEW_tmp["id"] = Date.now().toString();
                    EEW = EEW_tmp;
                    console.log(JSON.stringify(EEW));
                    //writeStream.write(`${JSON.stringify(RFPLUS)}\n`);
                }
            }
        }else{
            EEW = {
                "id":"0",
                "time":0,
                "center":{
                    "lat":0,
                    "lon":0,
                    "depth":0,
                    "cname":""
                },
                "scale":0,
                "report_num":0,
                "final":false
            }
        }

		alert_list_before = alert_list;
		alert_list = [];
        /*----------生成速報檔案----------*/
        fs.writeFile(filePath, JSON.stringify(RFPLUS), (err) => {
            if (err) {
              console.error('There is an error while writing RFPLUS file:', err);
            }
        });
    })

},1000)