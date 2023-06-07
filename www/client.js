import {protocolsConfig, ipsConfig, portConfig} from './chartsConfig.js';
const socket = io();

// svg icons to display
const playIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" class="icon"><path d="M73 39c-14.8-9.1-33.4-9.4-48.5-.9S0 62.6 0 80V432c0 17.4 9.4 33.4 24.5 41.9s33.7 8.1 48.5-.9L361 297c14.3-8.7 23-24.2 23-41s-8.7-32.2-23-41L73 39z"/></svg>';
const pauseIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512" class="icon"><path d="M48 64C21.5 64 0 85.5 0 112V400c0 26.5 21.5 48 48 48H80c26.5 0 48-21.5 48-48V112c0-26.5-21.5-48-48-48H48zm192 0c-26.5 0-48 21.5-48 48V400c0 26.5 21.5 48 48 48h32c26.5 0 48-21.5 48-48V112c0-26.5-21.5-48-48-48H240z"/></svg>';

// regex to check time for temporary blok
const timoutRegex = /^(\d+h)?(\d+m)?(\d+s)?$/;

class Stats {
    pause = false;
    statistics = {};
    page = 0;
    PAGE_LIMIT = 15;
    selectedIP = undefined;
    pauseData = undefined;
    logged = false;

    constructor() {
        // Protocols chart
        this.protocols = new Chart("protocols", protocolsConfig);

        // Ips chart
        const ctx = document.getElementById("ips");
        this.ips = new Chart(ctx, ipsConfig);

        ctx.onclick = click => {
            const points = this.ips.getElementsAtEventForMode(click, "nearest",
                { intersect: true }, true);
            if (points.length) {
                const firstPoint = points[0];
                const currentDataset = this.pause ? this.pauseData : this.statistics;
                this.selectedIP = currentDataset.ips[firstPoint._index + this.PAGE_LIMIT * this.page];
                socket.emit('ip address', this.selectedIP.ip);
                this.set_data_ips();
            }
        }

        // Ports chart
        this.ports = new Chart("ports", portConfig);

        // Functionality for buttons
        const nextIpButton = document.getElementById('next');
        nextIpButton.addEventListener('click', () => {
            const currentDataset = this.pause ? this.pauseData :this.statistics;
            this.page = (Math.ceil(currentDataset.ips.length / this.PAGE_LIMIT) == this.page + 1) ? this.page : this.page + 1;
            this.set_data_ips();
        });

        const prevIpButton = document.getElementById('prev');
        prevIpButton.addEventListener('click', () => {
            this.page = (this.page == 0) ? this.page : this.page - 1;
            this.set_data_ips();
        });

        const blockButton = document.getElementById('block');
        blockButton.addEventListener('click', () => {
            let action, callback;
            if (this.selectedIP.status == 1) {
                action = 'unblock';
                blockButton.textContent = 'BLOCK SELECTED IP';
                this.selectedIP.status = 0;
                callback = (succesfully, ip) => { if (succesfully) document.getElementById(ip).remove();};
            }
            else {
                action = 'block';
                blockButton.textContent = 'UNBLOCK SELECTED IP';
                this.selectedIP.status = 1;
                callback = (ip, rule, action) => this.edit_rules(ip, rule, action);

            }
            this.conf_buttons(this.selectedIP.status);
            socket.emit(action, this.selectedIP.ip, callback);
        });

        const blockOrgButton = document.getElementById('block_org');
        blockOrgButton.addEventListener('click', () => {
            let action, callback;
            if (this.selectedIP.status == 1) {
                action = 'unblock';
                blockOrgButton.textContent = 'BLOCK ORGRANISATION';
                this.selectedIP.status = 0;
                callback = (succesfully, ip) => { if (succesfully) document.getElementById(ip).remove();};
            }
            else {
                action = 'block';
                blockOrgButton.textContent = 'UNBLOCK ORGRANISATION';
                this.selectedIP.status = 1;
                callback = (ip, rule, action) => this.edit_rules(ip, rule, action);
            }
            this.conf_buttons(this.selectedIP.status);
            socket.emit(action, this.selectedIP.org.netRange, callback);
        });

        const tmpBlockButton = document.getElementById('tmp_block');
        tmpBlockButton.addEventListener('click', () => {
            let action, time, callback;
            if (this.selectedIP.status == 2) {
                action = 'remove tmp block';
                tmpBlockButton.textContent = 'BLOCK IP TEMPORARY';
                this.selectedIP.status = 0;
                callback = (succesfully, ip) => { if (succesfully) document.getElementById(ip).remove();};
            }
            else {
                action = 'tmp block';
                tmpBlockButton.textContent = 'UNBLOCK FROM TEMPORARY';
                this.selectedIP.status = 2;
                const el = document.getElementById('timeout');
                time = this.checkTimeout(el.value.trim());
                el.value = '';
                callback = (ip, rule, action) => this.edit_rules(ip, rule, action);
            }
            this.conf_buttons(this.selectedIP.status);
            socket.emit(action, this.selectedIP.ip, time, callback);
        });

        const showButton = document.getElementById('stat_show');
        showButton.addEventListener('click', () => {
            let action, callback;
            if (this.selectedIP.status == 3) {
                action = 'add to stats';
                showButton.textContent = 'DON`T SHOW IN STATS';
                this.selectedIP.status = 0;
                callback = (succesfully, ip) => { if (succesfully) document.getElementById(ip).remove();};
            }
            else {
                action = 'remove from stats';
                showButton.textContent = 'SHOW IN STATS';
                this.selectedIP.status = 3;
                callback = (ip, rule, action) => this.edit_rules(ip, rule, action);
            }
            this.conf_buttons(this.selectedIP.status);
            socket.emit(action, this.selectedIP.ip, callback);
        });

        const similarButton = document.getElementById('similar');
        similarButton.addEventListener('click', () => {
            document.getElementById('similar-header').textContent = `IPs with similar trafic for ${this.selectedIP.ip}`;
            socket.emit('similar ips', this.selectedIP.ip, ips => {
                let out = "<tr><th>address</th><th>edit distance</th></tr>";
                for (let [ip, distance] of ips) {
                    out += `<tr><td>${ip}</td><td>${distance}</td></tr>`;
                }
                document.getElementById('similar-ips').innerHTML = out;
            });
        });

        const resetButton = document.getElementById('reset_ip');
        resetButton.addEventListener('click', () => {
            socket.emit('reset', this.selectedIP.ip);
        });

        const stop = document.getElementById('stop');
        stop.addEventListener('click', () => {
            if (confirm("Do you want to shutdown monitoring tool?")) {
                socket.emit('shutdown');
                this.selectedIP = undefined;
            }
        });

        const pauseButton = document.getElementById('pause');
        pauseButton.addEventListener('click', () => {
            this.pause = !this.pause;
            this.pauseData = {...this.statistics};
            pauseButton.innerHTML = this.pause ? playIcon : pauseIcon;
        });

        const resetAllButton = document.getElementById('reset-all');
        resetAllButton.addEventListener('click', () => {
            if (confirm("Do you want reset statistics for all IPs?")) {
                socket.emit('reset all');
                this.selectedIP = undefined;
            }
        });

        // Socket communcation
        socket.on('ip detail', ipData => {
            if (!ipData) {
                console.log("No data!");
                return;
            }
            ipData.netRange = ipData.start_range + " - " + ipData.end_range;
            this.selectedIP.org = ipData;
            this.ip_details(ipData);
            this.conf_buttons(this.selectedIP.status);
        });

        socket.on('data update', statistics => {
            if (!this.logged) {
                this.logged = true;
                document.getElementById('login').classList.add('hide');
                document.getElementById('stats').classList.remove('hide');
                socket.emit('get rules', rules => {
                    for (let rule of rules) {
                        if (rule.type !== 0) {
                            this.edit_rules(rule.ip, ...this.getTextAndAction(rule.type));
                        }
                    }
                })
            }
            if (this.selectedIP) {
                this.selectedIP.status = statistics.ips[this.selectedIP.ip].status;
                this.conf_buttons(this.selectedIP.status);
            }
            statistics.ips = Object.values(statistics.ips)
            statistics.ips.sort((a, b) => b.count - a.count);
            this.statistics = statistics;
            this.set_data_protocols(statistics.protocols);
            this.set_data_ips();
            this.set_data_port(statistics.portStat);
        });

        socket.on('remove rule', ip => {
            document.getElementById(ip).remove();
        })
    }

    // Display new data in ips chart
    set_data_ips() {
        const ipStats = (this.pause) ? this.pauseData.ips : this.statistics.ips;
        this.ips.data.labels = ipStats.map(x => x.ip).slice(this.page * this.PAGE_LIMIT, (this.page + 1) * this.PAGE_LIMIT);
        this.ips.data.datasets[0].data = ipStats.map(x => x.count).slice(this.page * this.PAGE_LIMIT, (this.page + 1) * this.PAGE_LIMIT);
        this.ips.data.datasets[0].backgroundColor = ipStats.map(x => {
            switch (x.status) {
                case 0: return '#006600'; // allowed
                case 1: return '#660000'; // blocked
                case 2: return '#000066'; // tmp blocked 
                case 3: return undefined; // removed from stats 
            }
        }).slice(this.page * this.PAGE_LIMIT, (this.page + 1) * this.PAGE_LIMIT);
        this.ips.data.datasets[1].data = ipStats.map(x => Math.round(x.size / 1024)).slice(this.page * this.PAGE_LIMIT, (this.page + 1) * this.PAGE_LIMIT);
        if (this.selectedIP) {
            this.ips.data.datasets[0].borderColor = ipStats.map(x => x.ip == this.selectedIP.ip ? "#ffff00" : undefined).slice(this.page * this.PAGE_LIMIT, (this.page + 1) * this.PAGE_LIMIT);
        }
        this.ips.update();
    }

    // Display new data in protocols chart
    set_data_protocols(values) {
        if (this.pause) {
            return;
        }
        this.protocols.data.datasets[0].data = values;
        this.protocols.update();
    };

    // Display new data in ports chart
    set_data_port(portStat) {
        if (this.pause) {
            return;
        }
        this.ports.data.labels = Object.keys(portStat);
        this.ports.data.datasets[0].data = Object.values(portStat);
        this.ports.update();
    }

    // Show detailed information about selected IP
    ip_details(ipData) {
        const text = `OrgName: ${ipData.organisation}<br>
        Country: ${ipData.country}<br>
        NetRange: ${ipData.netRange}<br>
        Abuse mail: <a href='mailto:${ipData.abuse_mail}'>${ipData.abuse_mail}</a><br>`;
        const i = document.getElementById('ip-info');
        i.innerHTML = text;
    }

    // Names for buttons
    conf_buttons(ip_status) {
        document.getElementById('block').textContent = (ip_status == 1) ? 'UNBLOCK SELECTED IP' : 'BLOCK SELECTED IP';
        document.getElementById('block_org').textContent = (ip_status == 1) ? 'UNBLOCK ORGRANISATION' : 'BLOCK ORGRANISATION';
        document.getElementById('tmp_block').textContent = (ip_status == 2) ? 'UNBLOCK FROM TEMPORARY' : 'BLOCK IP TEMPORARY';
        document.getElementById('stat_show').textContent = (ip_status == 3) ? 'SHOW IN STATS' : 'DON`T SHOW IN STATS';
    }

    checkTimeout(time) {
        return (timoutRegex.test(time)) ? time : "";
    }

    // Add row to rules listing
    edit_rules(ip, rule, action) {
        const template = `<td>${ip}</td><td>${rule}</td><td><button id="${ip}-button" type="button" class="btn btn-dark">REMOVE</button></td>`;
        const tr = document.createElement('tr');
        tr.setAttribute('id', ip);
        tr.innerHTML = template;
        document.getElementById('rules').append(tr);

        document.getElementById(`${ip}-button`).addEventListener('click', () => {
            console.log(ip, action);
            if (action === 'remove tmp block') {
                socket.emit(action, ip, undefined, succesfully => {
                    if (succesfully) {
                        document.getElementById(ip).remove();
                    }
                });
            }
            else {
                socket.emit(action, ip, succesfully => {
                    if (succesfully) {
                        document.getElementById(ip).remove();
                    }
                });
            }
        })
    }

    getTextAndAction(ruleType) {
        switch (ruleType) {
            case 1: return ['Blocked IP', 'unblock']; // blocked
            case 2: return ['Temporary blocked IP', 'remove tmp block']; // tmp blocked 
            case 3: return ['Removed from stats', 'add to stats']; // removed from stats 
        }
    }
}

function login() {
    console.log('login');
    let passwd = document.getElementById('passwd').value;
    passwd = MD5.generate(passwd);
    socket.emit('login', document.getElementById('username').value, passwd);
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('loginButton').addEventListener('click', login);
    new Stats();
});