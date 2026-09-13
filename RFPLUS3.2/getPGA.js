import mysql from 'mysql2/promise';

const conn2 = mysql.createPool({
    host: 'host.docker.internal',
    user: 'ws',
    password: '',
    database:'pga',
    port: 3306,
    waitForConnections: true,
});
console.log('[getPGA]Connected to MySQL pga DB');

export async function getPGA(){
    const [rows] = await conn2.query('SELECT * FROM station_list WHERE region != "JP" AND region != "CN" AND active = 1 AND sensitiveStation = 0');
    return rows;
}
