const { exec } = require('child_process');

class NFT {
    commandTemplates = {
        ADD_TO_SET: 'sudo nft add element inet filter {{set}} {{{address}}}',
        REMOVE_FROM_SET: 'sudo nft delete element inet filter {{set}} {{{address}}}',

        ADD_TO_TMP_SET: 'sudo nft add element inet filter {{set}} {{{address}} timeout {{time}}}',
    }

    nftSets = {
        BLOCK: 'blocked',
        TMP_BLOCK: 'blocked_temporary',
        NOT_IN_STATS: 'not_process',
    }

    connectCommand = 'sudo nft add rule inet filter monitoring queue num 1';
    disconnectCommand = 'sudo nft flush chain inet filter monitoring';

    ipStats = new Set();
    notInStatsIps = new IPSet(['127.0.0.1']);
    blockedIps = new IPSet();
    tmpBlockedIps = new IPSet();

    addIp(ip) {
        this.ipStats.add(IPSet.ipToNum(ip));
    }

    // Add rule to chain monitoring
    connectNfqueue() {
        exec(this.connectCommand, (e, out, err) => {
            if (e) {
              console.log("error" + e);
              return;
            }
            if (err) {
              console.log("stderr" + err);
              return;
            }
      });
    }

    // Remove rule from chain monitoring
    disconnectNfqueue() {
        exec(this.disconnectCommand, (e, out, err) => {
            if (e) {
              console.log("error" + e);
              return;
            }
            if (err) {
              console.log("stderr" + err);
              return;
            }
      });
    }

    executeSetCommand(command, set, ip, time) {
        command = command.replace('{{set}}', set).replace('{{address}}', ip);

        if (time) {
            command = command.replace('{{time}}', time);
        }
        exec(command, (e, out, err) => {
              if (e) {
                console.log("error" + e);
                return;
              }
              if (err) {
                console.log("stderr" + err);
                return;
              }
        });
    }

    // NDON`T SHOW IN STATS
    removeFromStats(ip) {
        if (this.notInStatsIps.has(ip)) {
            console.log(`${ip} is already not showing in stats`);
            return [];
        }
        this.executeSetCommand(this.commandTemplates.ADD_TO_SET, this.nftSets.NOT_IN_STATS, ip);
        return this.notInStatsIps.add(ip, this.ipStats);
    }

    addToStats(ip) {
        if (!this.notInStatsIps.has(ip)) {
            console.log(`${ip} is already showing in stats`);
            return [];
        }
        this.executeSetCommand(this.commandTemplates.REMOVE_FROM_SET, this.nftSets.NOT_IN_STATS, ip);
        return this.notInStatsIps.remove(ip, this.ipStats);
    }

    // BLOCK
    blockIp(ip) {
        if (this.blockedIps.has(ip)) {
            console.log(`${ip} is already blocked`);
            return [];
        }
        this.executeSetCommand(this.commandTemplates.ADD_TO_SET, this.nftSets.BLOCK, ip);
        return this.blockedIps.add(ip, this.ipStats);
    }

    unblockIp(ip) {
        if (!this.blockedIps.has(ip)) {
            console.log(`${ip} is not blocked`);
            return [];
        }
        this.executeSetCommand(this.commandTemplates.REMOVE_FROM_SET, this.nftSets.BLOCK, ip);
        return this.blockedIps.remove(ip, this.ipStats);
    }

    // TEMPORATY BLOCKED
    tmpBlockIp(ip, time) {
        if (this.tmpBlockedIps.has(ip)) {
            console.log(`${ip} is already temporary blocked`);
            return [];
        }
        this.executeSetCommand(this.commandTemplates.ADD_TO_TMP_SET, this.nftSets.TMP_BLOCK, ip, time);
        return this.tmpBlockedIps.add(ip, this.ipStats);
    }

    removeTmpBlockIp(ip) {
        if (!this.tmpBlockedIps.has(ip)) {
            console.log(`${ip} is not temorary blocked`);
            return [];
        }
        this.executeSetCommand(this.commandTemplates.REMOVE_FROM_SET, this.nftSets.TMP_BLOCK, ip);
        return this.tmpBlockedIps.add(ip, this.ipStats);
    }

    // Compute time in seconds for temporary block
    timeToSeconds(time) {
        let h = 0, m = 0, s = 0;
        let tmp = time.split('h');
        if (tmp.length != 1) {
            h = +tmp[0];
            tmp = tmp[1].split('m');
        } else {
            tmp = tmp[0].split('m');
        }
        if (tmp.length != 1) {
            m = +tmp[0];
            tmp = tmp[1].split('s');
        } else {
            tmp = tmp[0].split('s');
        }
        if (tmp.length != 1) {
            s = +tmp[0];
        }
        return h * 3600 + m * 60 + s;
    }
}

// Set to store ips and ip`s ranges
class IPSet {
    ips = new Set();
    ipRange = [];

    constructor(ips = []) {
        for (let ip of ips) {
            this.add(ip);
        }
    }

    add(ip, stats) {
        if (!ip.includes('-')) {
            this.ips.add(IPSet.ipToNum(ip));
            return [ip];
        }
        let out = [];
        let [from, to] = ip.split(' - ').map(x => IPSet.ipToNum(x));
        this.ipRange.push([from, to]);
        for (let i of stats) {
            if (from <= i && i <= to) {
                out.push(IPSet.ipToString(i));
            }
        }
        return out;
    }
    
    remove(ip, stats) {
        if (!ip.includes('-')) {
            this.ips.delete(IPSet.ipToNum(ip));
            return [ip];
        }
        let out = [];
        let [from, to] = ip.split(' - ').map(x => IPSet.ipToNum(x));
        for (let i=0; i<this.ipRange.length; i++) {
            let [f,  t] = this.ipRange[i];
            if (from === f && to === t) {
                this.ipRange.splice(i, 1);
                break;
            }
        }
        for (let i of stats) {
            if (from <= i && i <= to) {
                out.push(IPSet.ipToString(i));
            }
        }
        return out;
    }

    has(ip) {
        if (!ip.includes('-')) {
            return this.ips.has(IPSet.ipToNum(ip));
        }
        let [from, to] = ip.split(' - ').map(x => IPSet.ipToNum(x));
        for (let [f,  t] of this.ipRange) {
            if (from === f && to === t) {
                return true;
            }
        }
        return false;
    }

    static ipToNum(ip) {
        return +ip.split('.').map(d => ('000' + d).substring(d.length)).join('');
    }

    static ipToString(ip) {
        let out = "";
        for (let i=0; i<3; i++) {
            const tmp = '.' + (ip % 1000);
            out = tmp + out;
            ip = Math.floor(ip / 1000);
        }
        return ip + out;
    }
}

module.exports = NFT;
