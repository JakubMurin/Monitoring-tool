require('dotenv').config();
const nfq = require('nfqueue');
const IPv4 = require('pcap/decode/ipv4');
const { MD5 } = require("md5-js-tools");
const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);

const whois = require('whois');

const DB = require('./db');
const db = new DB();

const NFT = require('./nft');
const nft = new NFT();

const editDistance = require('./editDistance');

app.use('/', express.static('www'));
server.listen(9000, () => {
  console.log('Listen on port 9000');
})

// Addresses to exclude from port stats
const local_addresses = ['127.0.0.1'];

let sockets = new Set();

// load saved statistic from db
let statistic = {
  protocols: [0, 0, 0],
  ips: {},
  portStat: {}
};

db.startupLoad().then((out) => {
  if (out.some(x => x===undefined)) {
    console.log("Data was not loaded from db");
    return;
  }
  let stats = out[0];
  let rules = out[1];
  nft.loadStats(Object.keys(stats.ips));
  console.log("Data has been loaded from db");

  for (let rule of rules) {
    switch (rule.type) {
      case 2:
        if (rule.end_time - Date.now() <= 0) { break; }
        setTimeout( async (i) => {
          console.log(i, "tmp ends");
          statistic.ips[i].status = 0;
          nft.tmpBlockedIps.remove(i);
          for (let socket of sockets) {
            socket.emit('remove rule', i);
          }
          await db.addRule(ip, 0);
        }, rule.end_time - Date.now(), rule.ip);
      case 1:
      case 3:
        nft.addToSet(rule.ip, rule.type);
        for (ip of nft.ipInRange(rule.ip)) {
          stats.ips[ip].status = rule.type;
        }
    }
      
  }
  statistic = stats;
});

let tmp_stats = {};

// redirect packets to nfqueue
nft.connectNfqueue();
nft.loadLastNFTSets();

io.on('connect', socket => {
  console.log(`New client connected`)

  socket.on('disconnect', msg => {
    sockets.delete(socket);
    console.log(`Client disconected`);
  })

  socket.on('login', (username, passwd, wrong) => {
    const savedPasswd = MD5.generate(process.env.APP_PASSWORD)
    if (username !== process.env.APP_USERNAME || passwd !== savedPasswd) {
      wrong();
      return;
    }

    // Send info about ip address from whois
    socket.on('ip address', async ip => {
      await db.getIpInfo(ip).then(info => socket.emit('ip detail', info));
    })

    // Remove from stats
    socket.on('remove from stats', async (ip, callback) => {
      const toChange = nft.removeFromStats(ip);
      await db.addRule(ip, 3);
      for (let i of toChange) {
        statistic.ips[i].status = 3;
      }
      callback(ip, "Removed from stats", 'add to stats');
    })

    socket.on('add to stats', async (ip, callback) => {
      const toChange = nft.addToStats(ip);
      await db.addRule(ip, 0);
      for (let i of toChange) {
        statistic.ips[i].status = 0;
      }
      callback(true, ip);
    })

    // Block
    socket.on('block', async (ip, callback) => {
      const toChange = nft.blockIp(ip);
      await db.addRule(ip, 1);
      for (let i of toChange) {
        console.log(i);
        statistic.ips[i].status = 1;
      }
      callback(ip, "Blocked IP", 'unblock');
    })

    socket.on('unblock', async (ip, callback) => {
      const toChange = nft.unblockIp(ip);
      await db.addRule(ip, 0);
      for (let i of toChange) {
        statistic.ips[i].status = 0;
      }
      callback(true, ip);
    })

    // Temporary block
    socket.on('tmp block', async (ip, time, callback) => {
      const toChange = nft.tmpBlockIp(ip, time);
      const timeout = nft.timeToSeconds(time);

      const endDate = new Date();
      endDate.setSeconds(endDate.getSeconds() + timeout);

      await db.addRule(ip, 2, dateToTimestamp(endDate));
      for (let i of toChange) {
        statistic.ips[i].status = 2;
        setTimeout( async (i) => {
          statistic.ips[i].status = 0;
          nft.tmpBlockedIps.remove(i);
          for (let soc of sockets) {
            soc.emit('remove rule', i);
          }
          await db.addRule(ip, 0);
        }, timeout * 1000, i);
      }
      callback(ip, "Temporary blocked IP to " + endDate.toLocaleString('en-GB', {timeZone: 'UTC'}), 'remove tmp block');
    })

    socket.on('remove tmp block', async (ip, time, callback) => {
      const toChange = nft.removeTmpBlockIp(ip);
      await db.addRule(ip, 0);
      for (let i of toChange) {
        statistic.ips[i].status = 0;
      }
      callback(true, ip);
    })

    // Get and send similar ips for selected
    socket.on('similar ips', (ip, callback) => {
      similarIP(ip).then(x => {
        callback(x);
      });
    })

    // Send current nft rules
    socket.on('get rules', async callback => await db.getRulesWithConn().then(rules => callback(rules)));

    // Reset statistic for exact ip
    socket.on('reset', ip => {
      delete statistic.ips[ip];
      delete tmp_stats[ip];
      console.log('Reset statistics for ip', ip);
    })

    // Reset whole statistisc
    socket.on('reset all', async () => {
      statistic = {
        protocols: [0, 0, 0],
        ips: {},
        portStat: {}
      };
      tmp_stats = {};
      await db.saveStats(statistic);
      console.log('Reset whole statistics');
    })

    // Shutdow aplication
    socket.on('shutdown', () => {
      db.saveStats(statistic).then(async () => {
        nft.saveCurrentNFTSets();
        nft.disconnectNfqueue();
        await db.pool.end();
        process.exit();
      })
    })

    // Add to set with sockets for logged in clints
    sockets.add(socket);
  })
})

// Handle incoming packets
nfq.createQueueHandler(1, 67108864, function (nfpacket) {
  const packet = new IPv4().decode(nfpacket.payload, 0);

  if (packet.protocol == 1) { statistic.protocols[0] += 1 };
  if (packet.protocol == 6) { statistic.protocols[1] += 1 };
  if (packet.protocol == 17) { statistic.protocols[2] += 1 };

  const saddr = packet.saddr.toString();
  const sizeP = packet.length - packet.headerLength;

  // tmp stats
  if ((tmp = tmp_stats[saddr]) !== undefined) {
    tmp.count += 1;
    tmp.size += sizeP;
  } else {
    tmp_stats[saddr] = {
      count: 1,
      size: sizeP
    }
  }

  if ((ipStat = statistic.ips[saddr]) !== undefined) {
    ipStat.count += 1;
    ipStat.size += sizeP;
  } else {
    statistic.ips[saddr] = {
      ip: saddr,
      count: 1,
      status: 0,
      size: sizeP
    };
    nft.addIp(saddr);
    whois.lookup(saddr, (err, data) => db.saveWhois(saddr, parse_new_info(data)) );
  }

  // local addresses is not shown in port stats
  if (!local_addresses.includes(saddr)) {
    if (statistic.portStat[packet.payload.dport] !== undefined) {
      statistic.portStat[packet.payload.dport] += 1;
    }
    else {
      statistic.portStat[packet.payload.dport] = 1;
    }
  }

  // Accept packet to continue in nftables
  nfpacket.setVerdict(nfq.NF_ACCEPT);
});

// Refresh statistics every REFRESH_INTERVAL seconds
const updateInterval = +process.env.REFRESH_INTERVAL * 1000;
setInterval(() => {
  for (let socket of sockets) {
    socket.emit('data update', statistic);
  }
}, updateInterval);

// Save stats for ip since last save
const ipSaveInterval = +process.env.SAVE_INTERVAL_IP_STATS * 1000;
setInterval(async () => {
  await db.saveIpStats(tmp_stats);
  tmp_stats = {};
}, ipSaveInterval);

const saveInterval = +process.env.SAVE_INTERVAL_WHOLE_STATS * 1000;

// Save whole stats to db
setInterval(async () => {
  nft.saveCurrentNFTSets();
  await db.saveStats(statistic);
}, saveInterval);

// Get value from plain text
function getValueByKey(text, ...keys) {
  let keyReg = keys[0];
  if (keys.length > 1) {
    keyReg = '(' + keys.join('|') + ')';
  }
  const regex = new RegExp("^" + keyReg + ":(.*)$", "m");
  const match = regex.exec(text);
  if (match) return match[2].trim();
  return null;
}

// Separate important info from who.is response
function parse_new_info(data) {
  if (!data) {
    return undefined;
  }
  return {
    organisation: getValueByKey(data, "OrgName", "netname"),
    country: getValueByKey(data, "Country", "country"),
    netRange: getValueByKey(data, "NetRange", "inetnum"),
    abuse_mail: getValueByKey(data, "OrgAbuseEmail", "abuse-mailbox")
  };
}

// Get similar ips
async function similarIP(addr) {
  const time = +process.env.EDIT_DISTANCE_TIME;
  const match = +process.env.EDIT_DISTANCE_MATCH;
  const delta = +process.env.EDIT_DISTANCE_DELTA;

  const data = await db.getIpStats(time);
  const simIPs = [];

  const initial = data[addr];
  for (let [name, stats] of Object.entries(data)) {
    if (name == addr) { continue; }
    const pac = editDistance.levenshteinDistance(initial.count, stats.count, delta);
    if (pac <= initial.count.length * match) {
      simIPs.push([name, pac]);
      continue;
    }
    const siz = editDistance.levenshteinDistance(initial.size, stats.size, delta);
    if (siz <= initial.size.length * match) {
      simIPs.push([name, siz]);
    }
  }
  return simIPs;
}

// Transform date to mariadb timestamp
function dateToTimestamp(date) {
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, -1).replace('T', ' ')
}