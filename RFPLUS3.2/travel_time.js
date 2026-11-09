// JavaScript port of ExpTechTW/eq-travel-time/travel_time.py.
// Original project: ExpTech; original author: YuYu1015.
import {readFileSync} from "node:fs";

let table;
function load(){
    if(!table) table = JSON.parse(readFileSync(new URL("./time.json",import.meta.url),"utf8"));
    return table;
}
function locate(grid,value){
    if(value <= grid[0]) return [0,0];
    if(value >= grid[grid.length - 1]) return [grid.length - 2,1];
    let low = 0, high = grid.length - 1;
    while(high - low > 1){
        let mid = Math.floor((low + high) / 2);
        if(grid[mid] <= value) low = mid;
        else high = mid;
    }
    return [low,(value - grid[low]) / (grid[low + 1] - grid[low])];
}
function interpolate(values,depthGrid,distanceGrid,depth,distance){
    let [i,fi] = locate(depthGrid,depth);
    let [j,fj] = locate(distanceGrid,distance);
    return values[i][j] * (1 - fi) * (1 - fj) + values[i + 1][j] * fi * (1 - fj) + values[i][j + 1] * (1 - fi) * fj + values[i + 1][j + 1] * fi * fj;
}
function round(value,digits){
    return Number(value.toFixed(digits));
}

// depthKm and epicentralKm: km; returned times: seconds.
// Default clamp matches Python. Use bounds:"error" for earthquake location.
// Set rounded:false during optimization to avoid rounding plateaus.
export function travelTimes(depthKm,epicentralKm,{bounds = "clamp", rounded = true} = {}){
    if(!Number.isFinite(depthKm) || !Number.isFinite(epicentralKm)) throw new TypeError("Depth and distance must be finite numbers");
    if(bounds !== "clamp" && bounds !== "error") throw new TypeError("Unknown bounds mode");
    const t = load();
    if(bounds === "error" && (depthKm < t.depth[0] || depthKm > t.depth[t.depth.length - 1] || epicentralKm < t.dist[0] || epicentralKm > t.dist[t.dist.length - 1])){
        throw new RangeError("Depth or epicentral distance is outside the travel-time table");
    }
    const p = interpolate(t.p,t.depth,t.dist,depthKm,epicentralKm);
    const sp = interpolate(t.sp,t.depth,t.dist,depthKm,epicentralKm);
    return rounded ? {P:round(p,3), S:round(p + sp,3), SP:round(sp,3)} : {P:p, S:p + sp, SP:sp};
}
export function warningTime(depthKm,epicentralKm,elapsedSinceOt = 0,options){
    if(!Number.isFinite(elapsedSinceOt)) throw new TypeError("Elapsed time must be finite");
    const tt = travelTimes(depthKm,epicentralKm,options);
    return {...tt, lead_s:round(tt.S - elapsedSinceOt,2)};
}
export {travelTimes as travel_times, warningTime as warning_time};
