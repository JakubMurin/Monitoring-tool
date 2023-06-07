require('dotenv').config();
const mariadb = require('mariadb');

class DB {
    constructor() {
      this.dbConfig = {
        host: '127.0.0.1',
        port: 3306,
        database: process.env.DB_DATABASE,
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        connectionLimit: 5,
        bigIntAsNumber: true
      }
    }

    async connect() {
      this.pool = mariadb.createPool(this.dbConfig);
      return await this.pool.getConnection();
    }

    async disconect(conn) {
        if (conn === undefined) {
          return;
        }
        conn.end();
        if (this.pool === undefined) {
          return;
        }
        this.pool.end();
        this.pool = undefined;
    }

    // Save ip stats for short period
    async saveIpStats(tmp_stats){
      const conn = await this.connect();
      console.log("saving current data to db");

      const entries = Object.entries(tmp_stats);
      console.log(`${entries.length} rows`);
      
      for (const [address, data] of entries) {
        await conn.query(`INSERT INTO ip_stats (ip, count, size) VALUES ('${address}', ${data.count}, ${data.size})`);
      }

      console.log("data are saved to db");
      await this.disconect(conn);
    }

    // Get ip stats for past few hours
    async getIpStats(lastHours) {
      const conn = await this.connect();

      const rows = await conn.query(`SELECT * FROM ip_stats WHERE time_at >= DATE_SUB(NOW(), INTERVAL '0 ${lastHours}:0:0' DAY_SECOND) ORDER BY ip ASC, time_at ASC;`);

      await this.disconect(conn);
      return this.transformData(rows);
    }

    // Save all statistics to database
    async saveStats(data) {
      const conn = await this.connect();

      const tmp_id = await conn.query(`INSERT INTO saves (id) VALUES (NULL)`);
      const id = Number(tmp_id.insertId);

      // insert ip stats
      if (Object.keys(data.ips).length !==  0) {
        let statsQuery = `INSERT INTO stats (save_id, ip, count, size) VALUES `;
        for (let [ip, ip_data] of Object.entries(data.ips)) {
          statsQuery += `(${id},'${ip}',${ip_data.count},${ip_data.size}),`;
        }
        await conn.query(statsQuery.slice(0, -1));
      }

      // insert port stats
      if (Object.keys(data.portStat).length !==  0) {
        let portsQuery = `INSERT INTO ports (save_id, port, count) VALUES `;
        for (let [port, count] of Object.entries(data.portStat)) {
          portsQuery += `(${id},${port},${count}),`;
        }
        await conn.query(portsQuery.slice(0, -1));
      }

      // insert protocols stats
      await conn.query(`INSERT INTO protocols (save_id, icmp, tcp, udp) VALUES (${id},${data.protocols[0]},${data.protocols[1]},${data.protocols[2]})`);

      await this.disconect(conn);
    }

    // Get data from last save
    async getLastSave(conn) {
      let disconect = false;
      if (conn === undefined) {
        conn = await this.connect();
        disconect = true;
      }

      const statistic = {
        protocols: [0, 0, 0],
        ips: {},
        portStat: {}
      };

      let [save_id] = await conn.query(`SELECT id FROM saves ORDER BY time_at DESC LIMIT 1;`);
      if (save_id === undefined) {
        if (disconect) {
          await this.disconect(conn);
        }
        return statistic;
      }
      save_id = save_id.id;

      // get protocols
      const [protocols] = await conn.query(`SELECT * FROM protocols WHERE save_id=${save_id};`);
      if (protocols !== undefined) {
        statistic.protocols = [protocols.icmp, protocols.tcp, protocols.udp];
      }

      // get ports
      const ports = await conn.query(`SELECT * FROM ports WHERE save_id=${save_id};`);
      for (let port_data of ports) {
        statistic.portStat[port_data.port] = port_data.count;
      }

      // get stats
      const stats = await conn.query(`SELECT * FROM stats WHERE save_id=${save_id};`);
      for (let ip_data of stats) {
        statistic.ips[ip_data.ip] = {
          'ip': ip_data.ip,
          status: 0,
          count: ip_data.count,
          size: ip_data.size
        }
      }

      if (disconect) {
        await this.disconect(conn);
      }
      return statistic;
    }

    // Save info about new rule
    async addRule(ip, type, end_time='NULL') {
      const conn = await this.connect();

      const tmp_id = await conn.query(`INSERT INTO rules (ip, type, end_time) VALUES 
        ('${ip}',${type},${end_time})`);

      await this.disconect(conn);
    }

    // Get last applied rule for every ip
    async getRules(conn) {
      let disconect = false;
      if (conn === undefined) {
        conn = await this.connect();
        disconect = true;
      }

      const rows = await conn.query(`SELECT r1.ip, r1.type, r1.time_at, r1.end_time FROM rules r1 LEFT JOIN 
        rules r2 ON r1.ip = r2.ip AND r1.time_at < r2.time_at WHERE r2.ip IS NULL ORDER BY r1.time_at`);

      if (disconect) {
        await this.disconect(conn);
      }
      return rows;
    }

    // Save data from whois about ip
    async saveWhois(ip, data) {
      if (!data) {
        return
      }
      const conn = await this.connect();

      let start_range, end_range;
      [start_range, end_range] = data.netRange.split(' - '); 

      try {
        await conn.query(`INSERT INTO whois (ip, organisation, country, start_range, end_range, abuse_mail) VALUES
          ('${ip}','${data.organisation}','${data.country}','${start_range}','${end_range}','${data.abuse_mail}')`);
      } catch (e) {
        console.log(`Whois data about ${ip} is already saved`);
      }

      await this.disconect(conn);
    }

    // Get saved info about ip
    async getIpInfo(ip) {
      const conn = await this.connect();

      const [info] = await conn.query(`SELECT * FROM whois WHERE ip='${ip}'`);

      await this.disconect(conn);
      return info;
    }

    // Tranform data to exact format
    transformData(data) {
      let outputData = {};
      for (let ip of data) {
        if ((outputData[ip.ip]) !== undefined) {
          outputData[ip.ip].count.push(ip.count);
          outputData[ip.ip].size.push(ip.size);
        }
        else {
          outputData[ip.ip] = {
            count: [ip.count],
            size: [ip.size]
          }
        }
      }
      return outputData;
    }

    // Load data on startup
    async startupLoad() {
      const conn = await this.connect();

      const statistic = await this.getLastSave(conn);
      const rules = await this.getRules(conn);

      await this.disconect(conn);
      return [statistic, rules];
    }
}

module.exports = DB;
