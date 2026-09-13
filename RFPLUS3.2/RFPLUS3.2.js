const path = require("path");
const mysql = require('mysql2/promise');
var fs = require('fs');
const utils = require("./utils");
const getPGA = require("./getPGA").getPGA;
const RFPLUS3core = require("./RFPLUS3_core");
const filePath = "EEW_file/RFPLUS3.txt";
const RFPLUS3 = new RFPLUS3core.RFPLUS3();

const conn_record = mysql.createPool({
    host: 'host.docker.internal',
    user: 'ws',
    password: '',
    database:'rfplus',
    port: 3306,
    waitForConnections: true,
})
console.log('Connected to MySQL record DB');

let savedReportId = ""
let savedReportNum = 0;
let running = false;
const getEEW = setInterval(async ()=>{
    if (running) return; // 上次還沒跑完，跳過
    running = true;
    const rows = await getPGA();
    const [alert_list, , triggered] = RFPLUS3.addData(rows);
    const RFPLUS3_result = RFPLUS3.EEWcontrol(triggered);
    let report = {};
    if(RFPLUS3_result != 0){
        report = await RFPLUS3.EEWgenerateReport({ EEW_tmp: RFPLUS3_result });
    }else{
        report = await RFPLUS3.EEWgenerateReport();
    }
    if(report){
        if(report.report_num != 0){
            if(report.report_num != savedReportNum || report.id != savedReportId){
                savedReportId = report.id;
                savedReportNum = report.report_num;
                console.log(report);

                //發布速報
                fs.writeFile(path.join(__dirname, filePath), JSON.stringify(report), (err) => {
                    if (err) {
                        console.error('There is an error while writing RFPLUS file:', err);
                    }
                });

                //儲存紀錄
                await conn_record.query("INSERT INTO rfplus_reports VALUES (?,?,?,?,?,?,?,FROM_UNIXTIME(?),FROM_UNIXTIME(?),FROM_UNIXTIME(?))",[
                    report.id,
                    report.report_num,
                    report.scale,
                    report.center.lat,
                    report.center.lon,
                    report.center.depth,
                    report.center.cname,
                    report.time / 1000,
                    Date.now() / 1000,
                    Date.now() / 1000
                ]);
                const values = alert_list.map(item => [
                    report.id,
                    report.report_num,
                    item.id,
                    item.name,
                    parseFloat(item.lat),
                    parseFloat(item.lon),
                    parseFloat(item.pga_origin_15),
                    item.shindo_15,
                    item.isNew
                ]);
                const sql = `
                    INSERT INTO rfplus_triggered_stations
                    VALUES ?
                `;
                await conn_record.query(sql, [values]);
            }
        }
    }
    running = false;
}, 1000)