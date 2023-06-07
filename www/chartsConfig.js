export const protocolsConfig = {
    type: "bar",
    data: {
        labels: ["ICMP", "TCP", "UDP"],
        datasets: [{
            data: [],
            backgroundColor: '#000066',
        }]
    },
    options: {
        title: {
            display: true,
            text: 'Protocols'
        },
        legend: {
            display: false
        }
    }
};

export const ipsConfig = {
    type: "bar",
    data: {
        datasets: [{
            label: 'Count',
            data: undefined,
            backgroundColor: '#006600',
            borderWidth: 5,
            borderSkipped: false,
            order: 1,
        },
        {
            label: 'Size',
            data: undefined,
            borderColor: '#000000',
            type: 'line',
            order: 0,
        }
        ]
    },
    options: {
        title: {
            display: true,
            text: 'IPs'
        },
        legend: {
            display: false
        },
        scales: {
            yAxes: [{
                ticks: {
                    beginAtZero: true
                }
            }]
        },
    }
};

export const portConfig = {
    type: "bar",
    data: {
        datasets: [{
            data: undefined,
            backgroundColor: '#006600',
        }]
    },
    options: {
        title: {
            display: true,
            text: 'Ports'
        },
        legend: {
            display: false
        }
    }
};