# Postup inštalácie pre Linux Debian

1. V súbore [example.env](./example.env) môžeme zmeniť prístupové údaje do aplikácie a aj do databázy. Následne je potrebné súbor premenovať na `.env`.
2. Do súbora /etc/nftables.conf prekopírujeme obsah súbora rules.nft a reštartujeme nftables, pre aplikovanie nových pravidiel, príkazom `sudo systemctl restart nftables`.
3. V prípade, že sme v [.env](./env) zmenili údaje o databáze, zmeny prenesieme aj do scriptu [create.sql](./create.sql). Následne otvoríme si mariadb konzolu a pomocou príkazu `source full/path/to/sql/create.sql;` spustíme script. Potrebné je použiť celú cestu k súboru.
4. Nainštalujeme chýbajúce c knižnice `sudo apt−get install libnetfilter −queue−dev libpcap−dev`.
5. Príkazom `npm i` sa stiahneme node moduly
6. Aplikáciu spustíme príkazom `npm start`
7. V prípade prístupu zo servera je možné webovú stránku otvoriť 
lokálne [localhost:9000](http://localhost:9000) alebo na doméne servera s portom 9000