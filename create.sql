CREATE DATABASE `monitoring`;
USE `monitoring`;

CREATE USER monitor_admin@`%` IDENTIFIED BY 'superheslo';
GRANT ALL PRIVILEGES ON `monitoring`.* TO monitor_admin@`%`;

CREATE TABLE `ip_stats` (
  `time_at` timestamp DEFAULT (current_timestamp),
  `ip` varchar(15),
  `count` integer,
  `size` integer,
  PRIMARY KEY (`time_at`, `ip`)
);

CREATE TABLE `whois` (
  `ip` varchar(15) PRIMARY KEY,
  `organisation` varchar(255),
  `country` varchar(255),
  `start_range` varchar(15),
  `end_range` varchar(15),
  `abuse_mail` varchar(255)
);

CREATE TABLE `rule_types` (
  `id` integer NOT NULL PRIMARY KEY,
  `name` varchar(255)
);

INSERT INTO rule_types (id, name) VALUES
  (0, 'allowed'),
  (1, 'bloked'),
  (2, 'tmp blocked'),
  (3, 'not in stats');

CREATE TABLE `rules` (
  `time_at` timestamp PRIMARY KEY DEFAULT (current_timestamp),
  `ip` varchar(255),
  `type` integer,
  `end_time` timestamp NULL,
  FOREIGN KEY (`type`) REFERENCES `rule_types` (`id`)
    ON DELETE CASCADE
);

CREATE TABLE `saves` (
  `id` integer AUTO_INCREMENT PRIMARY KEY,
  `time_at` timestamp DEFAULT (current_timestamp)
);

CREATE TABLE `stats` (
  `save_id` integer,
  `ip` varchar(15),
  `count` integer,
  `size` integer,
  PRIMARY KEY (`save_id`, `ip`),
  FOREIGN KEY (`save_id`) REFERENCES `saves` (`id`)
    ON DELETE CASCADE
);

CREATE TABLE `protocols` (
  `save_id` integer PRIMARY KEY,
  `icmp` integer,
  `tcp` integer,
  `udp` integer,
  FOREIGN KEY (`save_id`) REFERENCES `saves` (`id`)
    ON DELETE CASCADE
);

CREATE TABLE `ports` (
  `save_id` integer,
  `port` integer,
  `count` integer,
  PRIMARY KEY (`save_id`, `port`),
  FOREIGN KEY (`save_id`) REFERENCES `saves` (`id`)
    ON DELETE CASCADE
);
