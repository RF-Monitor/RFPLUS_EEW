var mysql = require('mysql');
var fs = require('fs');
function distanceCaculator(Xlat,Xlon,Ylat,Ylon){
    const dx = (Ylat - Xlat) * 111;
    const dy = (Ylon - Xlon) * 101;
  
    return Math.sqrt(dx*dx + dy*dy);    
}
filePath = "C:/earthquake server/source/RFPLUS.txt"
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
    "report_num":0
}
//RFPLUS變數
let RFPLUS_first = 0;
let RFPLUS_time = 0;
let RFPLUS_second = 0;
let RFPLUS_first_lock = false;//所有測站未觸發時解鎖

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
const getEEW = setInterval(()=>{
    conn2.query('SELECT * FROM station_list WHERE region != "JP" AND region != "CN"', function(err, rows, fields) {
        let alert_list = [];
        let time_now = Date.now();
        /*----------篩選觸發測站----------*/
        let triggered = false;
        for(let i = 0; i<rows.length; i++){
            if(rows[i]["alert"] && time_now - rows[i]["timestamp"] <= 5000){
                alert_list.push(rows[i]);
                triggered = true;
            }
        }
        /*----------無觸發 解鎖變更第一站----------*/
        if(!triggered){
            if(RFPLUS_first_lock){
                console.log("RFPLUS_first unlocked");
            }
            RFPLUS_first= 0;
            RFPLUS_time = 0
            RFPLUS_first_lock = false;
        }
        /*----------未確認第一站----------*/
        if(!RFPLUS_first && !RFPLUS_first_lock){
            //console.log("RFPLUS_first not checked");
            //尋找第一站
            let a = 1;
            let RFPLUS_first_tmp = 0
            for(let i = 0;i<alert_list.length;i++){
                //找到第一站
                if(parseFloat(alert_list[i]["pga_origin_15"]) >= 10 && time_now - alert_list[i]["timestamp"] <= 5000){
                    if(RFPLUS_first_tmp == 0 || parseFloat(alert_list[i]["pga_origin_15"]) > parseFloat(RFPLUS_first_tmp[i]["pga_origin_15"])){
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
            let rate = 0;
            let count = 0;
            /*----------與其他測站進行內插計算----------*/
            for(let i = 0; i<alert_list.length; i++){
                if(alert_list[i]["id"] != RFPLUS_first["id"]){
                    let pga_diff = parseFloat(RFPLUS_first["pga_origin_15"]) - parseFloat(alert_list[i]["pga_origin_15"]);//加速度差
                    if(pga_diff > 0){
                        let distance = distanceCaculator(parseFloat(RFPLUS_first["lat"]),parseFloat(RFPLUS_first["lon"]),parseFloat(alert_list[i]["lat"]),parseFloat(alert_list[i]["lon"]));
                        let rate_tmp = pga_diff / distance;
                        rate = rate + rate_tmp;
                        count++;
                        console.log(alert_list[i]["name"]);
                        console.log(pga_diff);
                        console.log(distance);
                        console.log(rate_tmp);
                    } 
                }
            }
            if(count >= 1){//資料有效
                rate = rate / count;
                let RFPLUS_tmp = {
                    "time":RFPLUS_time,
                    "center":{
                        "lat":parseFloat(RFPLUS_first["lat"]),//float
                        "lon":parseFloat(RFPLUS_first["lon"]),///float
                        "pga":parseFloat(RFPLUS_first["pga_origin_15"]),//float
                        "cname":RFPLUS_first["cname"].replace(" ","")
                    },
                    "rate":rate//float
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
                    }
                //設為第一報
                }else{
                    RFPLUS_tmp["report_num"] = 1;
                    RFPLUS_tmp["id"] = RFPLUS_time.toString();
                    RFPLUS = RFPLUS_tmp;
                    console.log(JSON.stringify(RFPLUS));
                }
                
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
                    "report_num":0
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
                "report_num":0
            }
        }
        /*----------生成速報檔案----------*/
        fs.writeFile(filePath, JSON.stringify(RFPLUS), (err) => {
            if (err) {
              console.error('There is an error while writing RFPLUS file:', err);
            }
        });
    })

},1000)