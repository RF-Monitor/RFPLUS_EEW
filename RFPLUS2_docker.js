var mysql = require('mysql');
var fs = require('fs');
const path = require("path")
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
const writeStream = fs.createWriteStream(path.join(__dirname, './alert.log'), { flags: 'a' });
filePath = "EEW_file/RFPLUS2.txt"
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
//RFPLUS變數
let RFPLUS_first = 0;
let RFPLUS_time = 0;
let RFPLUS_second = 0;
let RFPLUS_first_lock = false;//所有測站未觸發時解鎖

function handleDisconnect_conn2() {
    conn2 = mysql.createConnection({
        host: 'host.docker.internal',
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

let final = false //true時停止計算，只能發布最終報
alert_list = [];
alert_list_before = [];

const getEEW = setInterval(()=>{
    conn2.query('SELECT * FROM station_list WHERE region != "JP" AND region != "CN" AND active = 1', function(err, rows, fields) {
        let time_now = Date.now();
        let shake_alert = 0;//警報(0 or 1)
        let shake_alert_count = 0;//觸發測站計數
        let alert_dist = [];//所有觸發測站的經緯度[[lat,lon],[lat,lon]]
        /*----------篩選觸發測站----------*/
        let triggered = false;
        for(let i = 0; i<rows.length; i++){
            //檢查是否觸發
            if(rows[i]["alert"] && time_now - rows[i]["timestamp"] <= 5000){
                //檢查是否已經在觸發列表內
                for(let j = 0;j < alert_list_before.length; j++){
                    if(alert_list_before[j]["id"] == rows[i]["id"]){//在觸發列表內
                        //檢查PGA是否降低
                        if(parseFloat(rows[i]["pga_origin_15"]) < parseFloat(alert_list_before)){//PGA降低
                            let final = true //收斂地震，停止計算，發布最終報
                        }
                    }
                }

                alert_list.push(rows[i])//新增至觸發列表
                alert_dist.push([parseFloat(rows[i]["lat"]),parseFloat(rows[i]["lon"])]);//新增至經緯度列表
                shake_alert_count++;
                triggered = true;
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
        }
        /*----------未確認第一站----------*/
        if(!RFPLUS_first && !RFPLUS_first_lock && shake_alert){
            //尋找第一站
            let a = 1;
            let RFPLUS_first_tmp = 0
            for(let i = 0;i<alert_list.length;i++){
                //找到第一站
                if(parseFloat(alert_list[i]["pga_origin_15"]) >= 10 && time_now - alert_list[i]["timestamp"] <= 5000){
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
        /*----------已確認第一站----------*/
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
                let rate = 0;
                let count = 0;
                /*----------與其他測站進行計算----------*/
                for(let i = 0; i<alert_list.length; i++){
                    //if(alert_list[i]["id"] != RFPLUS_first["id"]){
                    if(1){
                        //let pga_diff = parseFloat(RFPLUS_first["pga_origin_15"]) - parseFloat(alert_list[i]["pga_origin_15"]);//加速度差
                        let pga = parseFloat(alert_list[i]["pga_origin_15"]);
                        //if(pga_diff > 0){
                        if(1){
                            let distance = distanceCaculator2(parseFloat(RFPLUS_first["lat"]),parseFloat(RFPLUS_first["lon"]),parseFloat(alert_list[i]["lat"]),parseFloat(alert_list[i]["lon"]),10);
                            //let rate_tmp = pga_diff / distance;
                            let rate_tmp = pga / Math.pow(distance, -1.607);
                            rate = rate + rate_tmp;
                            count++;
                            console.log(alert_list[i]["name"]);
                            console.log(pga);
                            console.log(distance);
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
		alert_list_before = alert_list;
		alert_list = [];
        /*----------生成速報檔案----------*/
        fs.writeFile(path.join(__dirname, filePath), JSON.stringify(RFPLUS), (err) => {
            if (err) {
              console.error('There is an error while writing RFPLUS file:', err);
            }
        });
    })

},1000)