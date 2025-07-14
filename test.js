const numeric = require('numeric');
function distanceCaculator3(Xlat,Xlon,Xdepth,Ylat,Ylon,Ydepth){
    const dx = (Ylat - Xlat) * 111;
    const dy = (Ylon - Xlon) * 101;
    const dz = (Ydepth - Xdepth);
  
    return Math.sqrt(dx*dx + dy*dy + dz*dz);    
}
function distanceCaculator(Xlat,Xlon,Ylat,Ylon){
    const dx = (Ylat - Xlat) * 111;
    const dy = (Ylon - Xlon) * 101;
  
    return Math.sqrt(dx*dx + dy*dy);    
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

near_center_list = [
    {"lat":23.996,"lon":121.605,"triggerTime":1732721559913,"sensitive":false},
    {"lat":23.958,"lon":121.604,"triggerTime":1732721560200,"sensitive":false},
    {"lat":24.59,"lon":121.83,"triggerTime":1732721566244,"sensitive":true}
]
                let waveSPD = 3.5;
                let PwaveSPD = 6.5;
                //平面求解
                if(near_center_list.length == 3){
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
                        //let residualsArray = residuals(p, x_a, x_b, x_c, x_d, y_a, y_b, y_c, y_d, d_a, d_b, d_c, d_d);
                        let residualsArray = residuals(p, x_a, x_b, x_c, y_a, y_b, y_c, d_a, d_b, d_c);
                        //let x = residuals[3];
                        //let penalty = (x < 0) ? 1000000 : 0;  // 如果x为负数，加大惩罚值
                        let value = residualsArray.reduce((sum, r) => sum + r * r, 0);
                        console.log(p);
                        console.log(value);
                        return value;
                    };

                    let initialGuess = [parseFloat(near_center_list[0]["lat"]),parseFloat(near_center_list[0]["lon"]),10];
                    // 使用 numeric.js 的最小二乘法來優化
                    let result = numeric.uncmin(f, initialGuess);
                    let stations_print = [
                        [parseFloat(near_center_list[0]["lat"]),parseFloat(near_center_list[0]["lon"]),0],
                        [parseFloat(near_center_list[1]["lat"]),parseFloat(near_center_list[1]["lon"]),(near_center_list[1]["triggerTime"] - near_center_list[0]["triggerTime"]) / 1000 * waveSPD],
                        [parseFloat(near_center_list[2]["lat"]),parseFloat(near_center_list[2]["lon"]),(near_center_list[2]["triggerTime"] - near_center_list[0]["triggerTime"]) / 1000 * waveSPD]
                    ];
                    console.log(JSON.stringify(stations_print));
                    console.log(result.solution);  // 返回優化結果
                    //console.log(f([24.06,121.69]))
                }